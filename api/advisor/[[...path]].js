"use strict";

const { handleAdvisorRequest } = require("../../advisor_server");

module.exports = async function advisorApi(req, res) {
  return handleAdvisorRequest(req, res);
};
