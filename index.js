#!/usr/bin/env node
const logger = require('js-logger');
const { CoverageSync } = require('./src/CoverageSync');

console.log("running...");
logger.useDefaults();

const notionKey = "XXXX-XXXX-XXXX-XXXX"; // Replace with real key
const notionDatabaseID = "XXXX-XXXX"; // Replace with real id
const synctron = new CoverageSync(notionKey, notionDatabaseID, logger);
synctron.run();
