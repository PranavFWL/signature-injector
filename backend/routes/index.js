// backend/routes/index.js
const express = require("express");
const router = express.Router();

router.use(require("./upload"));
router.use(require("./sign"));

module.exports = router;
