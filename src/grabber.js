var NNTPWorker, NzbGrabber, async, log, nzb, yenc;

async = require('async');

log = require('node-logging');

NNTPWorker = require('./nntp.js');

nzb = require('./nzb.js');

yenc = require('./yenc.js');

NzbGrabber = (function() {
  function NzbGrabber(opts) {
    var i, self, workers;
    this.opts = opts;
    if (!this.opts.conn) {
      throw 'No conections';
    }
    workers = (function() {
      var k, ref, results;
      results = [];
      for (i = k = 0, ref = this.opts.conn; 0 <= ref ? k < ref : k > ref; i = 0 <= ref ? ++k : --k) {
        results.push(new NNTPWorker(this.opts));
      }
      return results;
    }).call(this);
    self = this;
    this.queue = (function() {
      var q;
      q = [];
      return {
        'next': function() {
          var article, callback, group, k, len, task, worker;
          if (task = q[0]) {
            group = task[0], article = task[1], callback = task[2];
            for (k = 0, len = workers.length; k < len; k++) {
              worker = workers[k];
              if (!(worker.state !== 'BUSY')) {
                continue;
              }
              q.shift();
              return worker.getArticle(group, article, function(err, code, buffer) {
                callback(err, buffer);
                return self.queue.next();
              });
            }
          }
        },
        'push': function(chunk, callback) {
          q.push([chunk.group, chunk.article, callback]);
          return self.queue.next();
        }
      };
    })();
  }


  /*
  Grab files specified in the input NZB package.
  @param {String} NZB file as a string from `fs.readFile`
  @param {Function} A callback called on an error or on a chunk processed.
      @param {String} Error
      @param {String} Filename as specified in the article received.
      @param {Buffer} A decoded chunk for you to deal with.
      @param {Boolean} Are we finished with the package?
  @return {void}
   */

  NzbGrabber.prototype.grab = function(input, cb) {
    var self;
    self = this;
    return async.waterfall([
      function(cb) {
        return nzb(input, cb);
      }, function(files, cb) {
        var todo;
        todo = 0;
        return files.forEach(function(file) {
          var cache, chunks, filename;
          filename = null;
          cache = [];
          todo += chunks = file.length;
          return file.forEach(function(chunk, i) {
            return self.queue.push(chunk, function(err, buffer) {
              var decoded, item, j, ref, seg;
              if (!buffer) {
                log.err(chunk.subject.bold + ' (' + (i + 1) + '/' + file.length + ') missing');
                decoded = (new Buffer(chunk.bytes)).fill(0);
              } else {
                log.inf(chunk.subject.bold + ' (' + (i + 1) + '/' + file.length + ') received');
                ref = yenc(buffer), filename = ref[0], decoded = ref[1];
              }
              cache[i] = decoded;
              chunks -= 1;
              if (!filename) {
                if (!chunks) {
                  cache = null;
                  return cb('Useless file ' + chunk.subject);
                }
              } else {
                j = 0;
                while (j <= file.length) {
                  item = cache[j];
                  if (!item) {
                    return;
                  }
                  j += 1;
                  if (typeof item === 'boolean') {
                    continue;
                  }
                  seg = '';
                  if (file.length !== 1) {
                    seg = ' (' + j + '/' + file.length + ')';
                  }
                  log.inf('File ' + filename.bold + seg + ' done');
                  cb(null, filename, item, !(todo -= 1));
                  cache[j - 1] = true;
                }
              }
            });
          });
        });
      }
    ], cb);
  };

  return NzbGrabber;

})();

module.exports = NzbGrabber;