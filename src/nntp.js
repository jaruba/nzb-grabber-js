  var NNTPWorker, async, id, log, net, stream,
    bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

  net = require('net');

  log = require('node-logging');

  stream = require('stream');

  async = require('async');

  id = 0;

  NNTPWorker = (function() {
    NNTPWorker.prototype.state = 'OFFLINE';

    NNTPWorker.prototype.error = null;

    NNTPWorker.prototype.group = null;

    function NNTPWorker(opts) {
      var self;
      this.opts = opts;
      this.onData = bind(this.onData, this);
      this.connect = bind(this.connect, this);
      self = this;
      this.id = id++;
      log.inf('#' + this.id + ': Thread started');
      this.callbacks = (function() {
        var q;
        q = [];
        return {
          'call': function(code, res) {
            var item;
            if (item = q.shift()) {
              if (typeof item !== 'function') {
                throw 'Callback is not a function';
              }
              return item(self.error, code, res);
            }
          },
          'add': function(callback) {
            return q.push(callback);
          }
        };
      })();
    }

    NNTPWorker.prototype.connect = function(cb) {
      var self;
      self = this;
      log.inf('#' + this.id + ': Connecting to ' + this.opts.host);
      this.callbacks.add(function() {
        if (!self.opts.user && !self.opts.pass) {
          cb(null);
          return;
        }
        return async.waterfall([
          function(cb) {
            self.mode = 'MESSAGE';
            return self.sendCommand('AUTHINFO USER ' + self.opts.user, 381, cb);
          }, function(code, res, cb) {
            self.mode = 'MESSAGE';
            return self.sendCommand('AUTHINFO PASS ' + self.opts.pass, 2, cb);
          }
        ], function(err) {
          if (err) {
            self.error = err;
          }
          return cb(null);
        });
      });
      this.mode = 'MESSAGE';
      this.client = net.connect({
        'host': this.opts.host,
        'port': this.opts.port
      }, function() {
        return log.inf('#' + self.id + ': Client connected');
      });
      this.client.on('end', function() {
        log.inf('#' + self.id + ': Client disconnected');
        self.ready = 0;
        self.group = null;
        self.client.destroy();
        return self.client = null;
      });
      this.client.on('error', function(err) {
        return self.error = err;
      });
      return this.client.on('data', this.onData);
    };

    NNTPWorker.prototype.sendCommand = function(command, expected, callback) {
      var i, p, pattern, ref;
      if (typeof expected === 'function') {
        callback = expected;
        expected = null;
      } else {
        pattern = ['\\d', '\\d', '\\d'];
        ref = String(expected).split('');
        for (i in ref) {
          p = ref[i];
          pattern[i] = p;
        }
        expected = new RegExp('^' + pattern.join('') + '$');
      }
      if (expected) {
        this.callbacks.add(function(err, code, buffer) {
          if (err) {
            return callback(err);
          }
          if (!code.match(expected)) {
            return callback(code + ' does not match ' + expected);
          }
          return callback(null, code, buffer);
        });
      } else {
        this.callbacks.add(callback);
      }
      this.code = null;
      log.dbg('#' + this.id + ':' + ' >> '.bold + command);
      return this.client.write(command + '\r\n');
    };

    NNTPWorker.prototype.onData = function(buffer) {
      var getCode, isArticleEnd, length, removeHeaders, res;
      getCode = function() {
        return buffer.toString('ascii', 0, 3);
      };
      isArticleEnd = function() {
        var length;
        length = buffer.length;
        return buffer.toString('ascii', length - 5) === '\r\n.\r\n';
      };
      removeHeaders = function(input) {
        var length;
        length = input.length;
        return input.slice(input.indexOf('\r\n\r\n') + 4, length - 3);
      };
      switch (this.mode) {
        case 'MESSAGE':
          length = buffer.length;
          res = buffer.slice(0, length - 2);
          log.dbg('#' + this.id + ': << ' + res.toString());
          return this.callbacks.call(getCode(), res);
        case 'ARTICLE_BEGIN':
          this.code = getCode();
          if (this.code === '430') {
            this.state = 'READY';
            this.callbacks.call(this.code, null);
            return;
          }
          if (isArticleEnd()) {
            this.state = 'READY';
            return this.callbacks.call(this.code, removeHeaders(buffer));
          } else {
            this.mode = 'ARTICLE_CONTINUE';
            return this.article = [buffer];
          }
          break;
        case 'ARTICLE_CONTINUE':
          this.article.push(buffer);
          if (isArticleEnd()) {
            this.state = 'READY';
            return this.callbacks.call(this.code, removeHeaders(Buffer.concat(this.article)));
          }
      }
    };


    /*
    Get an article in a group.
    @param {String} Group name.
    @param {String} Article id.
    @param {Function} A callback called on an error or article decoded (once).
        @param {String} Error
        @param {Buffer} An article buffer for you to deal with (undecoded) or null if not found.
    @return {void}
     */

    NNTPWorker.prototype.getArticle = function(group, article, cb) {
      var self, sendArticle, sendGroup, steps;
      self = this;
      sendGroup = function(cb) {
        self.mode = 'MESSAGE';
        self.group = group;
        return self.sendCommand('GROUP ' + group, 2, function() {
          return cb(null);
        });
      };
      sendArticle = function(cb) {
        if (!article.match(/^<(\S*)>$/)) {
          article = '<' + article + '>';
        }
        self.mode = 'ARTICLE_BEGIN';
        return self.sendCommand('ARTICLE ' + article, 2, cb);
      };
      if (this.state === 'OFFLINE') {
        steps = [this.connect, sendGroup, sendArticle];
      } else {
        if (this.group !== group) {
          steps = [sendGroup, sendArticle];
        } else {
          steps = [sendArticle];
        }
      }
      this.state = 'BUSY';
      return async.waterfall(steps, cb);
    };

    return NNTPWorker;

  })();

  module.exports = NNTPWorker;