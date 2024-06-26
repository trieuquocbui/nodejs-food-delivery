const FileService = require('./FileService.js');
const Product = require('../models/Product.js');
const PriceDetail = require('../models/PriceDetail.js');
const OrderDetail = require('../models/OrderDetail.js');
const Code = require('../constants/CodeConstant.js');
const Category = require('../models/Category.js');

const getProductList = (inforQuery) => {
    return new Promise(async (resolve, reject) => {
        try {
            const searchConditions = {};
            if (inforQuery.searchQuery) {
                searchConditions.$or = [
                    { name: { $regex: inforQuery.searchQuery, $options: 'i' } },
                ];
            }
            const currentDate = new Date();
            const productList = await Product.aggregate([
                {
                    $match: searchConditions
                },
                {
                    $lookup: {
                        from: 'price_details',
                        let: { productId: '$_id' },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ['$productId', '$$productId'] },
                                            { $lte: ['$appliedAt', currentDate] }
                                        ]
                                    }
                                }
                            },
                            { $sort: { appliedAt: -1 } },
                            { $limit: 1 }
                        ],
                        as: 'latestPriceDetail'
                    }
                },
                {
                    $unwind: {
                        path: '$latestPriceDetail',
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $project: {
                        _id: 1,
                        name: 1,
                        categoryId: 1,
                        thumbnail: 1,
                        description: 1,
                        sold: 1,
                        quantity: 1,
                        status: 1,
                        featured: 1,
                        latestPrice: '$latestPriceDetail.newPrice',
                        appliedAt: '$latestPriceDetail.appliedAt'
                    }
                },
                {
                    $sort: { [inforQuery.sortField]: inforQuery.sortOrder }
                },
                {
                    $skip: (inforQuery.page - 1) * inforQuery.limit
                },
                {
                    $limit: inforQuery.limit
                }
            ])

            const total = await Product.countDocuments();
            const totalPages = Math.ceil(total / inforQuery.limit);
            const isLastPage = inforQuery.page >= totalPages;

            let result = {
                data: productList,
                total: total,
                page: inforQuery.page,
                totalPages: totalPages,
                isLastPage: isLastPage,
            }
            resolve(result);
        } catch (error) {
            console.log(`Có lỗi xảy ra trong quá trình lấy danh sách sản phẩm: ${error}`);
            let err = {
                code: Code.ERROR,
                message: "Có lỗi xảy ra trong quá trình lấy danh sách sản phẩm"
            };
            reject(err);
        }
    })
}

const createProduct = (file, data, userId, next) => {
    return new Promise(async (resolve, reject) => {
        try {
            let checkId = await Product.findOne({ _id: data.id });
            if (checkId) {
                let err = {
                    code: Code.ENTIRY_EXIST,
                    message: "Mã sản phẩm đã tồn tại!",
                }
                return next(err);
            }

            let checkName = await Product.findOne({ name: data.name });
            if (checkName) {
                let err = {
                    code: Code.ENTIRY_EXIST,
                    message: "Tên sản phẩm đã tồn tại!",
                }
                return next(err);
            }

            let checkCategory = await Category.findOne({ _id: data.categoryId });
            if (!checkCategory) {
                let err = {
                    code: Code.ENTITY_NOT_EXIST,
                    message: "Thể loại không tồn tại!",
                }
                return next(err);
            }

            let image = await FileService.uploadImage(file);

            if (image.code != Code.SUCCESS) {
                let err = {
                    code: image.code,
                    message: image.message,
                }
                return next(err);
            }

            let newProduct = new Product({
                _id: data.id,
                name: data.name,
                categoryId: checkCategory._id,
                thumbnail: image.data._id,
                description: data.description,
                sold: 0,
                quantity: data.quantity,
                status: data.status,
                featured: data.featured
            })

            let product = await newProduct.save();

            let newPriceDetail = new PriceDetail({
                adminId: userId,
                productId: product._id,
                newPrice: data.price,
                appliedAt: new Date(),
                createdAt: new Date(),
            })

            let priceDetail = await newPriceDetail.save();

            let productInfor = {
                _id: newProduct.id,
                name: newProduct.name,
                thumbnail: newProduct.thumbnail,
                description: newProduct.description,
                sold: newProduct.sold,
                quantity: newProduct.quantity,
                status: newProduct.status,
                featured: newProduct.featured,
                price: priceDetail.price
            }

            resolve(productInfor);
        } catch (error) {
            console.log(`Có lỗi xảy ra trong quá trình tạo sản phẩm: ${error}`);
            let err = {
                code: Code.ERROR,
                message: "Có lỗi xảy ra trong quá trình tạo sản phẩm"
            };
            reject(err);
        }
    })
}

const editProduct = (productId, file, data, next) => {
    return new Promise(async (resolve, reject) => {
        try {
            let checkProduct = await Product.findOne({ _id: productId });
            if (!checkProduct) {
                let err = {
                    code: Code.ENTITY_NOT_EXIST,
                    message: "Không tìm thấy sản phẩm",
                }
                return next(err);
            }

            let checkName = await Product.findOne({ name: data.name });
            if (checkName) {
                let err = {
                    code: Code.ENTIRY_EXIST,
                    message: "Tên sản phẩm đã tồn tại!",
                }
                return next(err);
            }

            let checkCategory = await Category.findOne({ _id: data.categoryId });
            if (!checkCategory) {
                let err = {
                    code: Code.ENTITY_NOT_EXIST,
                    message: "Thể loại không tồn tại!",
                }
                return next(err);
            }

            let editProduct = new Product({
                name: data.name,
                categoryId: checkCategory._id,
                description: data.description,
                sold: 0,
                quantity: data.quantity,
                status: data.status,
                featured: data.featured
            })

            if (file) {
                let image = await FileService.uploadImage(file);

                if (image.code != Code.SUCCESS) {
                    let err = {
                        code: image.code,
                        message: image.message,
                    }
                    return next(err);
                }

                editProduct.thumbnail = image.data._id;

                await FileService.deleteImage(checkProduct.thumbnail);

            }

            await Product.updateOne({ _id: productId }, editProduct);

            checkProduct = await Product.findOne({ _id: productId });

            let productInfor = {
                _id: checkProduct.id,
                name: checkProduct.name,
                thumbnail: checkProduct.thumbnail,
                description: checkProduct.description,
                sold: checkProduct.sold,
                quantity: checkProduct.quantity,
                status: checkProduct.status,
                featured: checkProduct.featured,
            }

            resolve(productInfor);
        } catch (error) {
            console.log(`Có lỗi xảy ra trong quá trình chỉnh sữa sản phẩm: ${error}`);
            let err = {
                code: Code.ERROR,
                message: "Có lỗi xảy ra trong quá trình chỉnh sữa sản phẩm"
            };
            reject(err);
        }
    })
}

const deleteProduct = (productId, next) => {
    return new Promise(async (resolve, reject) => {
        try {
            let product = await Product.findOne({ _id: productId });

            if (!product) {
                let err = {
                    code: Code.ENTITY_NOT_EXIST,
                    message: "Không tìm thấy sản phẩm"
                }
                return next(err);
            }

            let count = await OrderDetail.countDocuments({ productId: productId }).count();

            if (count > 0) {
                let err = {
                    code: Code.ERROR,
                    message: "Không thể xóa sản phẩm"
                }
                return next(err);
            }

            await FileService.deleteImage(product.thumbnail);

            await PriceDetail.deleteMany({ productId: productId });

            await Product.deleteOne({ _id: productId });

            resolve(productId);

        } catch (error) {
            console.log(`Có lỗi xảy ra trong quá trình xóa sản phẩm: ${error}`);
            let err = {
                code: Code.ERROR,
                message: "Có lỗi xảy ra trong quá trình xóa sản phẩm"
            };
            reject(err);
        }
    })
}

const getPriceListOfProduct = (productId, inforQuery) => {
    return new Promise(async (resolve, reject) => {
        try {

            const priceList = await PriceDetail.find({ productId: productId })
                .sort({ [inforQuery.sortField]: inforQuery.sortOrder })
                .skip((inforQuery.page - 1) * inforQuery.limit)
                .limit(inforQuery.limit);

            const total = await PriceDetail.countDocuments({ productId: productId });
            const totalPages = Math.ceil(total / inforQuery.limit);
            const isLastPage = inforQuery.page >= totalPages;

            let result = {
                data: priceList,
                total: total,
                page: inforQuery.page,
                totalPages: totalPages,
                isLastPage: isLastPage,
            }
            resolve(result);
        } catch (error) {
            console.log(`Có lỗi xảy ra trong quá trình lấy danh sách giá: ${error}`);
            let err = {
                code: Code.ERROR,
                message: "Có lỗi xảy ra trong quá trình lấy danh sách giá"
            };
            reject(err);
        }
    })
}

const addNewPrice = (productId, userId, data, next) => {
    return new Promise(async (resolve, reject) => {
        try {
            let product = await Product.findOne({ _id: productId });
            if (!product) {
                let err = {
                    code: Code.ENTITY_NOT_EXIST,
                    message: "Không tìm thấy sản phẩm"
                }
                return next(err);
            }

            let priceDetail = new PriceDetail({
                adminId: userId,
                productId: productId,
                newPrice: data.price,
                appliedAt: data.applied,
                createdAt: new Date(),
            })

            let newPriceDetail = priceDetail.save();

            resolve(newPriceDetail);

        } catch (error) {
            console.log(`Có lỗi xảy ra trong quá trình tạo giá cho sản phẩm: ${error}`);
            let err = {
                code: Code.ERROR,
                message: "Có lỗi xảy ra trong quá trình tạo giá cho sản phẩm"
            };
            reject(err);
        }
    })
}

const delelteNewPrice = (priceId, next) => {
    return new Promise(async (resolve, reject) => {
        try {
            let priceDetail = await PriceDetail.findOne({ _id: priceId });
            if (priceDetail.appliedAt < new Date()) {
                let err = {
                    code: Code.ERROR,
                    message: "Không thể xóa giá này vì đã áp dụng",
                }
                return next(err)
            } else if (+priceDetail.appliedAt === +new Date()) {
                let err = {
                    code: Code.ERROR,
                    message: "Không thể xóa giá này vì đã áp dụng",
                }
                return next(err)
            }

            await PriceDetail.deleteOne({ _id: priceId });

            resolve(priceId);

        } catch (error) {
            console.log(`Có lỗi xảy ra trong quá trình quá giá mới`);
            let err = {
                code: Code.ERROR,
                message: "Có lỗi xảy ra trong quá trình quá giá mới",
            }
            reject(err)
        }
    })
}

const getProduct = (productId, next) => {
    return new Promise(async (resolve, reject) => {
        try {
            let product = await Product.findOne({ _id: productId });
            if (!product) {
                let err = {
                    code: Code.ENTITY_NOT_EXIST,
                    message: "Không tìm thấy sản phẩm",
                }
                return next(err);
            }

            let priceDetail = await PriceDetail.find({ productId: productId, appliedAt: { $lte: new Date() } })
                .sort({ appliedAt: -1 }).limit(1);

            let productInfor = {
                _id: product.id,
                name: product.name,
                thumbnail: product.thumbnail,
                description: product.description,
                sold: product.sold,
                quantity: product.quantity,
                status: product.status,
                featured: product.featured,
                price: priceDetail[0].newPrice
            }
            resolve(productInfor);

        } catch (error) {
            console.log(`Có lỗi xảy ra trong quá trình lấy sản phẩm: ${error}`);
            let err = {
                code: Code.ERROR,
                message: "Có lỗi xảy ra trong quá trình lấy sản phẩm"
            };
            reject(err);
        }
    })
}

module.exports = { createProduct, editProduct, deleteProduct, addNewPrice, delelteNewPrice, getPriceListOfProduct, getProductList, getProduct }