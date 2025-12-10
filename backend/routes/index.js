// backend/routes/index.js
const express = require("express");
const router = express.Router();

router.use(require("./upload"));
router.use(require("./sign"));
router.use(require("./download"));

module.exports = router;
