const express = require('express')
const router = express.Router()
const bodyParser = require('body-parser')

const models = require('../models')

router.get('/', function (req, res, next) {
  res.status(400)
  next(null, req, res, next)
})

router.post('/postbySingleserver', bodyParser.json(), models.postbySingleserver);
router.post('/postbyITX', bodyParser.json(), models.postbyITX);
router.get('/getSinglesenderInfo', bodyParser.json(), models.getSinglesenderInfo);
router.get('/getITXdepositerInfo', bodyParser.json(), models.getITXdepositerInfo);

module.exports = router
