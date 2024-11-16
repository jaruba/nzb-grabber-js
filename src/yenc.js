  var c, char, crc32, k, len, log, ref;

  crc32 = require('buffer-crc32');

  log = require('node-logging');

  c = {};

  ref = ['.', '\n', '\r', '='];
  for (k = 0, len = ref.length; k < len; k++) {
    char = ref[k];
    c[char] = char.charCodeAt(0);
  }

  module.exports = function(input) {
    var buffer, code, filename, i, j, length, line, processLine;
    line = [];
    filename = null;
    buffer = new Buffer(input.length);
    i = 0;
    processLine = function() {
      var calc, calc2, code, escape, l, len1, match, pcrc32, ref1, results, stringy;
      if (line.length === 0) {
        return;
      }
      if ((line[0] === (ref1 = line[1]) && ref1 === c['.'])) {
        line.shift();
      }
      stringy = new Buffer(line.slice(0, 7)).toString();
      if (match = stringy.match(/^\=(ybegin|ypart|yend)/)) {
        switch (match[1]) {
          case 'ybegin':
            if (match = new Buffer(line).toString().match(/name\=([^\s]*)/)) {
              filename = match[1];
            }
            break;
          case 'yend':
            buffer = buffer.slice(0, i);
            if (pcrc32 = new Buffer(line).toString().match(/pcrc32\=([^\s]*)/)) {
              calc = (crc32.unsigned(buffer)).toString(16).toLowerCase().replace(/^0+/, '');
              calc2 = pcrc32[1].toLowerCase().replace(/^0+/, '');
              if (calc !== calc2) {
                log.err('File ' + filename.bold + (" crc fail, expected " + calc2 + " got " + calc));
              }
            }
        }
        return;
      }
      stringy = null;
      escape = false;
      results = [];
      for (l = 0, len1 = line.length; l < len1; l++) {
        code = line[l];
        if (code === c['='] && !escape) {
          results.push(escape = true);
        } else {
          if (escape) {
            code -= 64;
            escape = false;
          }
          code -= 42;
          results.push(buffer[i++] = code);
        }
      }
      return results;
    };
    j = 0;
    length = input.length;
    while (j < length) {
      code = input[j++];
      if (code === c['\n'] || code === c['\r']) {
        processLine();
        line = [];
        continue;
      }
      line.push(code);
    }
    processLine();
    input = null;
    return [filename, buffer];
  };