const express = require("express");
const router = express.Router();

router.use(require("./upload"));
router.use(require("./sign"));
router.use(require("./download"));
router.use(require("./files"));

module.exports = router;
