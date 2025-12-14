// @ts-nocheck
import express from 'express';
var router = express.Router();

/* GET users listing. */
export const router = router.get('/', function(req, res, next) {
  res.send('respond with a resource');
});