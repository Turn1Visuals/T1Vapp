'use strict';

const { loadToken } = require('./token');

async function getToken() {
  const cached = loadToken();
  if (cached) return cached.token;
  throw new Error('No F1 token — please log in via Settings');
}

module.exports = { getToken };
