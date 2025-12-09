const express = require("express");
const router = express.Router();
const { signPdf } = require("../controllers/signController");

router.post("/", signPdf);

module.exports = router;
