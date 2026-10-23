/**
 * Vercel Serverless Function Entry Point for HisabX
 */

const server = require('../server');

module.exports = (req, res) => {
  if (typeof server.requestHandler === 'function') {
    return server.requestHandler(req, res);
  }
  return server.emit('request', req, res);
};
