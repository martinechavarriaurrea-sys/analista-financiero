"use strict";

const { handleAdvisorRequest } = require("../advisor_server");

module.exports = async function healthApi(req, res) {
  req.url = "/health";
  return handleAdvisorRequest(req, res);
};
