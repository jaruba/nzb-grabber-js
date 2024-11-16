var async, fs, xml;

async = require('async');

xml = require('xml2js');

fs = require('fs');

/*
Parse an NZB file.
@param {String} NZB file as a string from `fs.readFile`
@param {Function} A callback called with an Array of Array of articles to download.
  @param {String} Error
  @param {Array} Of files to articles (ordered).
@return {void}
*/

module.exports = function(input, cb) {
  return async.waterfall([
    function(cb) {
      return xml.parseString(input, cb);
    }, function(obj, cb) {
      return async.map(obj.nzb.file, function(file, cb) {
        var group, i, len, ref, segment, segments, subject;
        subject = file.$.subject;
        group = file.groups[0].group[0];
        segments = [];
        ref = file.segments[0].segment;
        for (i = 0, len = ref.length; i < len; i++) {
          segment = ref[i];
          segments[parseInt(segment.$.number) - 1] = {
            'group': group,
            'article': segment._,
            'bytes': parseInt(segment.$.bytes),
            'subject': subject
          };
        }
        return cb(null, segments);
      }, cb);
    }
  ], cb);
};