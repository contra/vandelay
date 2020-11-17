"use strict";

exports.__esModule = true;
exports.default = void 0;

var _through2Concurrent = _interopRequireDefault(require("through2-concurrent"));

var _lodash = require("lodash");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const defaultConcurrency = 8;
const defaultWaterMark = 16;

var _default = (fn, opt = {}) => {
  if (typeof fn !== 'function') throw new Error('Invalid function!');
  const concurrency = opt.concurrency != null ? opt.concurrency : defaultConcurrency;

  const tap = (row, _, cb) => {
    let meta; // pluck the ___meta attr we attached in fetch

    if (row && typeof row === 'object') {
      meta = row.___meta;
      delete row.___meta;
    }

    fn(row, meta).then(res => {
      if (res == null) return cb();

      if (meta) {
        res = (0, _lodash.clone)(res);
        res.___meta = meta;
      }

      cb(null, res);
    }).catch(cb);
  };

  return _through2Concurrent.default.obj({
    maxConcurrency: concurrency,
    highWaterMark: Math.max(defaultWaterMark, concurrency)
  }, tap);
};

exports.default = _default;
module.exports = exports.default;