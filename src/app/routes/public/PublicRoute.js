const express = require('express');
const router = express.Router();
const PublicController = require('../../controllers/public/PublicController.js');

const OrderController = require('../../controllers/employee/OrderController.js')

router.get('/image/:imageId', PublicController.getImage);

router.get('/product/:productId', PublicController.getProduct);

router.get('/order/:orderId', PublicController.getOrder);

module.exports = router;