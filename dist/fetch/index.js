"use strict";

exports.__esModule = true;
exports.default = void 0;

var _pumpify = _interopRequireDefault(require("pumpify"));

var _through = _interopRequireDefault(require("through2"));

var _oauth = require("./oauth");

var _fetchWithParser = _interopRequireDefault(require("./fetchWithParser"));

var _multi = _interopRequireDefault(require("./multi"));

var _sandbox = _interopRequireDefault(require("../sandbox"));

var _mergeURL = _interopRequireDefault(require("../mergeURL"));

var _page = _interopRequireDefault(require("./page"));

var _hardClose = _interopRequireDefault(require("../hardClose"));

var _parse = _interopRequireDefault(require("../parse"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const getFetchOptions = (src, opt, setupResult = {}) => ({
  fetchURL: opt.fetchURL,
  debug: opt.debug,
  timeout: opt.timeout,
  connectTimeout: opt.connectTimeout,
  attempts: opt.attempts,
  context: opt.context,
  headers: _objectSpread(_objectSpread({}, src.headers || {}), setupResult.headers || {}),
  query: _objectSpread(_objectSpread({}, src.query || {}), setupResult.query || {}),
  accessToken: setupResult.accessToken
}); // default behavior is to fail on first error


const defaultErrorHandler = ({
  error,
  output
}) => {
  output.emit('error', error);
};

const getQuery = (pageOpt, page) => {
  const out = {};
  if (pageOpt.pageParam) out[pageOpt.pageParam] = page;
  if (pageOpt.limitParam && pageOpt.limit) out[pageOpt.limitParam] = pageOpt.limit;
  if (pageOpt.offsetParam) out[pageOpt.offsetParam] = page * pageOpt.limit;
  return out;
};

const fetchStream = (source, opt = {}, raw = false) => {
  const concurrent = opt.concurrency != null ? opt.concurrency : 8;

  if (Array.isArray(source)) {
    // zips eat memory, do not run more than one at a time
    const containsZips = source.some(i => i.parserOptions && i.parserOptions.zip);
    if (containsZips && opt.debug) opt.debug('Detected zip, running with concurrency=1');
    return (0, _multi.default)({
      concurrent: containsZips ? 1 : concurrent,
      inputs: source.map(i => fetchStream.bind(null, i, opt, true)),
      onError: opt.onError || defaultErrorHandler
    });
  } // validate params


  if (!source) throw new Error('Missing source argument');

  const src = _objectSpread({}, source); // clone


  if (!src.url || typeof src.url !== 'string') throw new Error('Invalid source url');

  if (typeof src.parser === 'string') {
    if (src.parserOptions && typeof src.parserOptions !== 'object') throw new Error('Invalid source parserOptions');
    src.parser = (0, _parse.default)(src.parser, src.parserOptions); // JSON shorthand
  }

  if (typeof src.parser !== 'function') throw new Error('Invalid parser function');
  if (src.headers && typeof src.headers !== 'object') throw new Error('Invalid headers object');
  if (src.oauth && typeof src.oauth !== 'object') throw new Error('Invalid oauth object');
  if (src.oauth && typeof src.oauth.grant !== 'object') throw new Error('Invalid oauth.grant object'); // actual work time

  const runStream = setupResult => {
    if (src.pagination) {
      const startPage = src.pagination.startPage || 0;
      return (0, _page.default)(startPage, currentPage => {
        const newURL = (0, _mergeURL.default)(src.url, getQuery(src.pagination, currentPage));
        return (0, _fetchWithParser.default)({
          url: newURL,
          parser: src.parser,
          source
        }, getFetchOptions(src, opt, setupResult));
      }, {
        concurrent,
        onError: defaultErrorHandler
      }).pause();
    }

    return (0, _fetchWithParser.default)({
      url: src.url,
      parser: src.parser,
      source
    }, getFetchOptions(src, opt, setupResult));
  }; // allow simple declarative oauth handling


  if (src.oauth) {
    src.setup = async ourSource => (0, _oauth.getToken)(ourSource.oauth).then(accessToken => ({
      accessToken
    }));
  }

  let outStream;

  if (src.setup) {
    var _src$setup;

    if (typeof src.setup === 'string') {
      src.setup = (0, _sandbox.default)(src.setup, opt.setup);
    }

    const setupFn = ((_src$setup = src.setup) === null || _src$setup === void 0 ? void 0 : _src$setup.default) || src.setup;
    if (typeof setupFn !== 'function') throw new Error('Invalid setup function!'); // if oauth enabled, grab a token first and then set the pipeline

    outStream = _pumpify.default.obj();
    setupFn(src, {
      context: opt.context
    }).then(setupResult => {
      const realStream = runStream(setupResult);
      outStream.url = realStream.url;
      outStream.abort = realStream.abort;
      outStream.setPipeline(realStream, _through.default.obj());
    }).catch(err => {
      outStream.emit('error', err);
      (0, _hardClose.default)(outStream);
    });
  } else {
    outStream = runStream();
  }

  if (raw) return outStream; // child of an array of sources, error mgmt handled already

  return (0, _multi.default)({
    concurrent,
    inputs: [outStream],
    onError: opt.onError || defaultErrorHandler
  });
};

var _default = fetchStream;
exports.default = _default;
module.exports = exports.default;