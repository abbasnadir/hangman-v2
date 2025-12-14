// @ts-nocheck
import express from 'express';
var router = express.Router();

/* GET home page. */
export const router = router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});
