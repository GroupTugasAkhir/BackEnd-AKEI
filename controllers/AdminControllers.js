const {db} = require('../connection')
const {uploader} = require('../helpers/uploader')
const {encrypt} = require('./../helpers')
const {createJWToken} = require('./../helpers/jwt')
const fs = require('fs')
const mysql = require('mysql')

module.exports = {
    addProduct: (req, res) => {
        try {
            // console.log('asas')
            const path = '/product'
            const upload = uploader(path, 'PROD').fields([{name: 'image'}])
            upload(req, res, (err)=>{
                if (err){
                    return res.status(500).json({message: 'Upload picture failed', error: err.message})
                }
                console.log('berhasil upload')
                const {image} = req.files
                console.log(image)
                const imagePath = image ? path + '/' + image[0].filename : null
                console.log(imagePath)
                console.log(req.body.data)
                const data = JSON.parse(req.body.data)
                let dataInsert = {
                    product_name: data.product_name,
                    price: data.price,
                    image:imagePath,
                    description: data.description,
                    date_in: Date.now()
                }

                console.log(dataInsert)
                db.query(`insert into tbl_product set ?`, dataInsert, (err, resultAddProduct)=>{
                    if(err) {
                        if(imagePath){
                            fs.unlinkSync('./public' + imagePath)
                        }
                        console.log(err)
                        return res.status(500).send(err)
                    }
                    sql="insert into ref_product_category (product_id, category_id) values ?"
                    
                    var insertRefCategory = data.categoryRefCart.map((val,index)=>{
                        console.log(val)
                        return [
                            resultAddProduct.insertId,
                            val.value
                        ]
                    })
                    db.query(sql, [insertRefCategory], (err)=>{
                        if (err) return res.status(500).send(err)
                        db.query(`select * from tbl_product`, (err, dataProduct)=>{
                            if (err) return res.status(500).send(err)

                            sql = `select p.product_id, c.category_id, p.product_name, c.category_name
                            from tbl_category c join ref_product_category pc on c.category_id = pc.category_id
                            join tbl_product p on pc.product_id = p.product_id ;`
                            db.query(sql, (err, datarefcategory)=>{
                                if (err) return res.status(500).send(err)

                                return res.status(200).send({dataProduct, datarefcategory})
                            })
                        })
                    })
                })
            })
        }catch(error){
            console.log('eror')
            return res.status(500).send(error)
        }
    },

    getProduct: (req, res)=>{
        // get product and category
        let sql = `select pd.product_detail_id, pd.product_id, 
        p.product_name, p.image, p.price, sum(quantity) as stock, p.description
        from tbl_product p join tbl_product_detail pd on p.product_id = pd.product_id 
        group by product_id;`
        db.query(sql, (err, dataproduct)=>{
            if (err) return res.status(500).send(err)
            
            sql = `select * from tbl_category`
            db.query(sql, (err, datacategory)=>{
                if (err) return res.status(500).send(err)

                sql = `select p.product_id, c.category_id, p.product_name, c.category_name
                from tbl_category c join ref_product_category pc on c.category_id = pc.category_id
                join tbl_product p on pc.product_id = p.product_id ;`
                db.query(sql, (err, datarefcategory)=>{
                    if (err) return res.status(500).send(err)
                    console.log({dataproduct, datacategory, datarefcategory})
                    return res.status(200).send({dataproduct, datacategory, datarefcategory})
                })
            })
        })
    },

    getProductandStock: (req, res) => {
        const {id} = req.params //product_id
        let sql = `select pd.product_detail_id, pd.product_id, 
        p.product_name, p.image, p.price, sum(quantity) as stock, p.description
        from tbl_product p join tbl_product_detail pd on p.product_id = pd.product_id 
        where pd.product_id=? group by product_id;`
        db.query(sql,[id],(err, dataproduct)=>{
            if (err) return res.status(500).send({message:err.message})

            sql = `select pc.product_category_id, p.product_id, c.category_id, p.product_name, c.category_name
            from tbl_category c join ref_product_category pc on c.category_id = pc.category_id
            join tbl_product p on pc.product_id = p.product_id 
            where p.product_id=?;`
            db.query(sql,[id],(err, dataRefCategory)=>{
                if (err) return res.status(500).send({message:err.message})
                
                return res.status(200).send({
                    dataproduct: dataproduct[0], 
                    dataRefCategory
                })
            })
        })
    },

    getProductbywh: (req, res)=> {
        const {prodID} = req.params
        let sql = `select sum(pd.quantity) as whstock, l.location_name from tbl_product_detail pd
        join tbl_location l on pd.location_id = l.location_id
        where pd.product_id = ${db.escape(prodID)} and !(pd.status in ('add', 'modify') and pd.notes is not null)
        group by pd.location_id;`

        db.query(sql, (err, theres)=> {
            if (err) return res.status(500).send({message:err.message})

            return res.send(theres)
        })
    },

    getStock: (req, res) => { //get stock and onpackaging stock from current WH
        const {id} = req.params // product_id
        let sql = `select * from tbl_location`
        db.query(sql, (err, listWarehouse)=>{
            if(err)return res.status(500).send(err)
            console.log(listWarehouse)

            sql = `select loc.location_id as loc_id, loc.location_name, datas.product_name, 
            datas.available_stock, datas.status, prod_id, lid, hold_stock, hold_status
            from tbl_location loc left join
            (select * from (-- stock semua gudang
            select pd.product_id, p.product_name, pd.location_id, pd.quantity, sum(quantity) as available_stock, pd.status
            from tbl_product_detail pd join tbl_product p on pd.product_id=p.product_id
            join tbl_location l on pd.location_id=l.location_id
            where pd.status !='onPackaging' group by pd.product_id, pd.location_id) as stck
            left join (-- on packaging
            select pd.product_id as prod_id, pd.location_id as lid, sum(quantity) as hold_stock, pd.status as hold_status
            from tbl_product_detail pd join tbl_product p on pd.product_id=p.product_id
            join tbl_location l on pd.location_id=l.location_id
            where pd.status='hold' group by pd.product_id, lid) as opkg on stck.product_id = opkg.prod_id and stck.location_id=opkg.lid
            where stck.product_id=${db.escape(id)}) as datas on loc.location_id=datas.location_id;`
            db.query(sql, (err, dataPerStockAllWH)=>{
                if(err)return res.status(500).send(err)
                return res.send(dataPerStockAllWH)
            })

        })
    },

    editProduct: (req, res)=>{
        const {id} = req.params
        let sql = `Select * from tbl_product where product_id = ${db.escape(id)}`
        db.query(sql, (err, results)=>{
            if(err)return res.status(500).send(err)

            if(results.length){
                try{
                    console.log('try editprod')
                    const path = '/product'
                    const upload = uploader(path, 'PROD').fields([{name: 'image'}])
                    upload(req, res, (err)=>{
                        if (err){
                            return res.status(500).json({message: 'Upload picture failed', error: err.message})
                        }
                        console.log('berhasil upload edit')
                        const {image} = req.files
                        // console.log(image)
                        const imagePath = image ? path + '/' + image[0].filename : null
                        // console.log(imagePath)
                        // console.log(req.body.data)
                        const data = JSON.parse(req.body.data)
                        let dataUpdate = {
                            product_name: data.product_name,
                            price: data.price,
                            image: imagePath ? imagePath : data.oldimage,
                            description: data.description
                        }
                        console.log(dataUpdate)


                        sql = `Update tbl_product set ? where product_id = ${db.escape(id)}`
                        // console.log('sini')
                        db.query(sql, dataUpdate, (err)=>{
                            if(err) {
                                if(imagePath){
                                    fs.unlinkSync('./public' + imagePath)
                                }
                                return res.status(500).send(err)
                            }

                            if(imagePath) { // hapus foto lama
                                if(results[0].image){
                                    fs.unlinkSync('./public'+ results[0].image)
                                }
                            }
                            db.beginTransaction((err)=>{
                                if (err) {
                                    return res.status(500).send(err)
                                }
                                
                                if(data.newcategory){
                                    sql = ''
                                    data.oldcategory.forEach(function (val) {
                                        sql += `delete from ref_product_category
                                        where product_category_id = ${db.escape(val.product_category_id)};`
                                    })
                                    // console.log(data.oldcategory)
                                    db.query(sql, (err)=>{
                                        if (err) {
                                            return db.rollback(()=>{
                                                // console.log('sss')
                                                console.log(err)
                                                res.status(500).send(err)
                                            })
                                        }
                                        // console.log('aaaaaaaaaaaaaaaaaaa')
                                        sql="insert into ref_product_category (product_id, category_id) values ?"
                            
                                        console.log(insertRefCategory)
                                        var insertRefCategory = data.newcategory.map((val,index)=>{
                                            console.log(val)
                                            return [
                                                data.product_id,
                                                val.value
                                            ]
                                        })
                                        // console.log('kkk')
                                        db.query(sql, [insertRefCategory], (err)=>{
                                            if (err) {
                                                return db.rollback(()=>{
                                                    res.status(500).send(err)
                                                })
                                            }
    
                                            db.commit((err)=>{
                                                if (err) {
                                                    return db.rollback(()=>{
                                                        res.status(500).send(err)
                                                    })
                                                }
                                                sql = `select pd.product_detail_id, pd.product_id, 
                                                p.product_name, p.image, p.price, sum(quantity) as stock, p.description
                                                from tbl_product p join tbl_product_detail pd on p.product_id = pd.product_id 
                                                group by product_id;`
                                                db.query(sql, (err, dataProduct)=>{
                                                    if (err) return res.status(500).send(err)
                
                                                    sql = `select p.product_id, c.category_id, p.product_name, c.category_name
                                                    from tbl_category c join ref_product_category pc on c.category_id = pc.category_id
                                                    join tbl_product p on pc.product_id = p.product_id ;`
                                                    db.query(sql, (err, datarefcategory)=>{
                                                        if (err) return res.status(500).send(err)
                
                                                        return res.status(200).send({dataProduct, datarefcategory})
                                                    })
                                                })
                                            })
        
                                        })
                                    })
                                }else{
                                    sql = `select pd.product_detail_id, pd.product_id, 
                                    p.product_name, p.image, p.price, sum(quantity) as stock, p.description
                                    from tbl_product p join tbl_product_detail pd on p.product_id = pd.product_id 
                                    group by product_id;`
                                    db.query(sql, (err, dataProduct)=>{
                                        if (err) return res.status(500).send(err)
    
                                        sql = `select p.product_id, c.category_id, p.product_name, c.category_name
                                        from tbl_category c join ref_product_category pc on c.category_id = pc.category_id
                                        join tbl_product p on pc.product_id = p.product_id ;`
                                        db.query(sql, (err, datarefcategory)=>{
                                            if (err) return res.status(500).send(err)
    
                                            return res.status(200).send({dataProduct, datarefcategory})
                                        })
                                    })
                                }
                                
                            })

                            
                        })
                    })
                }catch(error){
                    console.log('eror')
                    return res.status(500).send(error)
                }
            }else{
                return res.status(500).send('product tidak ada')
            }
        })
    },

    deleteProduct: (req, res) => {
        const {id} = req.params
        let sql = `select * from tbl_product where product_id = ${db.escape(id)}`
        db.query(sql, (err, dataproduct)=>{
            if(err) return res.status(500).send(err)
            if(dataproduct.length){
                sql = `delete from tbl_product where product_id = ${db.escape(id)}`
                db.query(sql, (err)=>{
                    if(err) return res.status(500).send(error)

                    if(dataproduct[0].image){
                        fs.unlinkSync('./public'+ dataproduct[0].image)
                    }
                    sql = `select * from tbl_product`
                    db.query(sql, (err, allproduct)=>{
                        if (err) return res.status(500).send(err)
                        return res.status(200).send(allproduct)
                    })
                })
            }else{
                return res.status(500).send('product tidak ada')
            }
        })
    },

    //========================================= HOME PAGE ========================================
    getAllProductCount: (req, res)=> {
        let sql = `select count(*) as countAllProd from tbl_product`
        db.query(sql, (err, countRes)=> {
            if (err) return res.status(500).send(err)
            return res.status(200).send(countRes)
        })
    },

    getCategProductCount: (req, res)=> {
        const {categID} = req.query
        let sql = `SELECT count(*) as countbyCateg FROM ref_product_category pc
        inner join tbl_product p
        on p.product_id = pc.product_id
        inner join tbl_category c
        on c.category_id = pc.category_id
        where c.category_id = ${categID};`
        db.query(sql, (err, countRes)=> {
            if (err) return res.status(500).send(err)
            return res.status(200).send(countRes)
        })
    },

    getProductbySearch: (req, res)=>{
        const {key} = req.params
        let sql = `SELECT p.product_id, p.image, p.price, p.product_name, c.category_id, c.category_name FROM ref_product_category pc
        inner join tbl_product p
        on p.product_id = pc.product_id
        inner join tbl_category c
        on c.category_id = pc.category_id
        where p.product_name like '%${key}%'`
        db.query(sql, (err, dataproduct)=>{
            if (err) return res.status(500).send(err)
            return res.status(200).send(dataproduct)
        })
    },

    getProductbyId: (req, res)=>{
        const {id} = req.params
        let sql = `SELECT sum(pd.quantity) as totalprod, p.product_id, p.description, p.image, p.price, p.product_name, c.category_id, c.category_name FROM ref_product_category pc
        inner join tbl_product p
        on p.product_id = pc.product_id
        inner join tbl_category c
        on c.category_id = pc.category_id
        inner join tbl_product_detail pd
        on pd.product_id = p.product_id
        where p.product_id = ? and !(pd.status in ('add', 'modify') and pd.notes is not null)`
        db.query(sql,[id],(err, dataproduct)=>{
            if (err) return res.status(500).send(err)
            return res.status(200).send(dataproduct)
        })
    },

    getProductbyPage:(req,res)=>{
        const {page} = req.params
        let sql = `select p.*, sum(pd.quantity) as totalprod from tbl_product p
        join tbl_product_detail pd on pd.product_id = p.product_id
        where !(pd.status in ('add', 'modify') and pd.notes is not null)
        group by pd.product_id
        having totalprod > 0
        limit ${(page-1)*6},6;`
        // let sql =`select * from tbl_product limit ${(page-1)*5},8`
        db.query(sql,(err,result)=>{
            if(err)return res.status(500).send(err)
            return res.status(200).send(result)
        })
    },

    getAllProductMobile:(req,res)=>{
        let sql = `select p.*, sum(pd.quantity) as totalprod from tbl_product p
        join tbl_product_detail pd on pd.product_id = p.product_id
        where !(pd.status in ('add', 'modify') and pd.notes is not null)
        group by pd.product_id
        having totalprod > 0`
        db.query(sql,(err,result)=>{
            if(err)return res.status(500).send(err)
            return res.status(200).send(result)
        })
    },

    getProductbyCategory:(req,res)=>{
        const {categId, page} = req.query
        let sql =`SELECT p.product_id, p.image, p.price, p.product_name, c.category_id, c.category_name FROM ref_product_category pc
        inner join tbl_product p
        on p.product_id = pc.product_id
        inner join tbl_category c
        on c.category_id = pc.category_id
        where c.category_id = ${db.escape(categId)}
        limit ${(page-1)*6},6;`
        db.query(sql,(err,result)=>{
            if(err)return res.status(500).send(err)
            return res.status(200).send(result)
        })
    },

    getProductbyNewArrival: (req, res)=>{
        let sql = `select distinct (product_id), product_name, image, description, price, date_in from tbl_product
        order by date_in desc limit 3`
        db.query(sql, (err, dataproduct)=>{
            if (err) return res.status(500).send(err)
            return res.status(200).send(dataproduct)
        })
    },

    getProductbyPopular: (req, res)=>{
        let sql = `select p.product_id, p.product_name, p.price, avg(c.rating) as avg_rating, p.image from tbl_comment c
        inner join tbl_product p
        on p.product_id = c.product_id
        group by p.product_id
        order by avg_rating desc limit 2`
        db.query(sql, (err, dataproduct)=>{
            if (err) return res.status(500).send(err)
            return res.status(200).send(dataproduct)
        })
    },

    getCategory: (req, res)=>{
        let sql = `select * from tbl_category`
        db.query(sql, (err, category)=>{
            if (err) return res.status(500).send(err)
            return res.status(200).send(category)
        })
    },

    //=========================================PRODUCT GUDANG========================================

    addWHProduct: (req, res) => {
        console.log(req.body)
        // const data = JSON.parse(req.body)
        const data = req.body
        // console.log(data)
        const dataInsert = {...data, date_in: Date.now()}
        console.log(dataInsert)
        let sql = `insert into tbl_product_detail set ?`
        db.query(sql, dataInsert,(err)=>{
            if(err) return res.status(500).send(err)
            sql = `select av_st.*, hd_st.hold_stock from
            (select p.product_id, pd.product_detail_id, p.product_name, p.image, sum(quantity) as available_stock 
            from tbl_product p join tbl_product_detail pd on p.product_id = pd.product_id 
            where location_id=${db.escape(dataInsert.location_id)} and pd.status !='onPackaging' group by product_id) as av_st
            left join
            (select  pd.product_id as prod_id, sum(quantity) as hold_stock 
            from tbl_product p join tbl_product_detail pd on p.product_id = pd.product_id 
            where location_id=${db.escape(dataInsert.location_id)} and pd.status ='hold' group by pd.product_id)
            as hd_st on av_st.product_id = hd_st.prod_id`

            db.query(sql, (err,results)=>{
                if(err)return res.status(500).send(err)
                return res.status(200).send(results)
            })
        })
    },

    getAllWHProduct: (req, res) => {
        let sql = `select * from tbl_product_detail`
        db.query(sql, (err,results)=>{
            if(err)return res.status(500).send(err)
            return res.status(200).send(results)
        })
    },

    getCurrentWHProduct: (req, res) => {
        const {id} = req.params //location_id
        let sql = `select av_st.*, hd_st.hold_stock from
        (select p.product_id, pd.product_detail_id, p.product_name, p.image, sum(quantity) as available_stock 
        from tbl_product p join tbl_product_detail pd on p.product_id = pd.product_id 
        where location_id=${db.escape(id)} and pd.status !='onPackaging' group by product_id) as av_st
        left join
        (select  pd.product_id as prod_id, sum(quantity) as hold_stock 
        from tbl_product p join tbl_product_detail pd on p.product_id = pd.product_id 
        where location_id=${db.escape(id)} and pd.status ='hold' group by pd.product_id)
        as hd_st on av_st.product_id = hd_st.prod_id`
        db.query(sql, (err, dataCurrentWH)=>{
            if(err)return res.status(500).send(err)
            
            sql = `select * from tbl_product`
            db.query(sql, (err, dataMainProd)=>{
                if(err)return res.status(500).send(err)
                return res.status(200).send({dataCurrentWH, dataMainProd})
            })
        })
    },

    //========================================= CATEGORY ========================================

    addCategory: (req, res) => {
        let data = req.body
        let sql = `insert into tbl_category set ?`
            db.query(sql,data,(err)=>{
                if(err) return res.status(500).send(err)
                
                sql = `select * from tbl_category`
                db.query(sql, (err,results)=>{
                    if(err)return res.status(500).send(err)
                    return res.status(200).send(results)
                })
        })
    },

    editCategory: (req, res)=>{
        let data = req.body
        const {id} = req.params
        let sql = `Select * from tbl_category where category_id = ${db.escape(id)}`
        db.query(sql, (err, results)=>{
            if(err)return res.status(500).send(err)

            if(results.length){
                sql = `Update tbl_category set ? where category_id = ${db.escape(id)}`
                db.query(sql, data, (err)=>{
                    if(err)return res.status(500).send(err)
                    sql = `Select * from tbl_category`
                    db.query(sql, (err, categories)=>{
                        if(err)return res.status(500).send(err)
                        return res.status(200).send(categories)
                    })
                })
            }else{
                return res.status(500).send('category tidak ada')
            }
        })
    },

    deleteCategory: (req, res) => {
        const {id} = req.params
        let sql = `Select * from tbl_category where category_id = ${db.escape(id)}`
        db.query(sql, (err, results)=>{
            if(err)return res.status(500).send(err)
            if(results.length){
                sql = `delete from tbl_category where category_id = ${db.escape(id)}`
                db.query(sql, (err)=>{
                    if(err)return res.status(500).send(err)

                    sql = `Select * from tbl_category`
                    db.query(sql, (err, categories)=>{
                        if(err)return res.status(500).send(err)
                        return res.status(200).send(categories)
                    })
                })
            }else{
                return res.status(500).send('category tidak ada')
            }
        })
    },

    //========================================= USER MANAGEMENT ========================================

    getWHLocation: (req, res)=> {
        let sql = `select * from tbl_location`
        db.query(sql, (err, dataWH)=> {
            if(err)return res.status(500).send(err)

            sql = `select user_id, username, tl.location_name as warehouse from tbl_location tl join tbl_user tu on tu.notes = tl.location_id where tu.role_id = 3`
            db.query(sql, (err, dataadminWH)=> {
                if(err)return res.status(500).send(err)

                return res.send({dataWH: dataWH, dataAdminWH: dataadminWH})
            })
        })
    },
    createAdminWH: (req, res)=> {
        const {username, password, email, notes} = req.body
        let hashPassword = encrypt(password)

        let sql = `select * from tbl_user where username = ${db.escape(username)}`
        db.query(sql, (err, userData)=> {
            if(err)return res.status(500).send(err)

            if(userData.length) {
                return res.status('500').send({message:'username is already register'})
            } else {
                let dataAdmin = {
                    username,
                    password: hashPassword,
                    email,
                    isVerified: 1,
                    photo: '/users/default.png',
                    role_id: 3,
                    date_created: Date.now(),
                    notes: notes
                }

                sql = 'insert into tbl_user set ?'
                db.query(sql, dataAdmin, (err)=> {
                    if(err)return res.status(500).send(err)
                    
                    sql = `select user_id, username, tl.location_name as warehouse from tbl_location tl join tbl_user tu on tu.notes = tl.location_id where tu.role_id = 3`

                    db.query(sql, (err, admin_data)=> {
                        if(err)return res.status(500).send(err)

                        // const token = createJWToken({user_id: admin_data[0].user_id, username: admin_data[0].username })
                        // admin_data[0].token = token
                        return res.send(admin_data)
                    })
                })
            }
        })
    },
    getalladminWH: (req, res)=> {
        let sql = `select user_id, username, tl.location_name as warehouse from tbl_location tl join tbl_user tu on tu.notes = tl.location_id where tu.role_id = 3`

        db.query(sql, (err, locData)=> {
            if(err)return res.status(500).send(err)
            // let newArray = []
            // locData.forEach((val)=> {
            //     newArray.push(val.notes.split(','))
            // })
            return res.send(locData)
        })
    },

    //========================================= TRACKING LOG ========================================
    
    getWHTrackingLog: (req, res)=> {
        const {page} = req.query
        if(page) {
            var sql = `select tp.product_name, tl.location_name, pd.quantity, pd.date_in, pd.status, pd.notes from tbl_product_detail pd
            join tbl_product tp on tp.product_id = pd.product_id
            join tbl_location tl on tl.location_id = pd.location_id
            where !(pd.status in ('onPackaging') and pd.notes is null)
            order by pd.date_in desc
            limit ${(page-1)*5}, 5`
        } else {
            var sql = `select tp.product_name, tl.location_name, pd.quantity, pd.date_in, pd.status, pd.notes from tbl_product_detail pd
            join tbl_product tp on tp.product_id = pd.product_id
            join tbl_location tl on tl.location_id = pd.location_id
            where !(pd.status in ('onPackaging') and pd.notes is null)`
        }

        db.query(sql, (err, inventLog)=> {
            if(err)return res.status(500).send(err)
            
            sql = `select count(*) as amountofprod from tbl_product_detail pd
            join tbl_product tp on tp.product_id = pd.product_id
            join tbl_location tl on tl.location_id = pd.location_id
            where !(pd.status in ('onPackaging') and pd.notes is null)`
            db.query(sql, (err, countProd)=> {
                if(err)return res.status(500).send(err)

                return res.send({inventLog: inventLog, countProd: countProd})
            })
        })
    },

    getWHActivityLog: (req, res)=> {
        const {userLoc, page} = req.query
        if(page) {
            var sql = `select tp.product_name, pd.quantity, pd.date_in, pd.status, pd.notes from tbl_product_detail pd
            join tbl_product tp on tp.product_id = pd.product_id
            join tbl_location tl on tl.location_id = pd.location_id
            where pd.location_id = ${db.escape(userLoc)} and !(pd.status in ('onPackaging') and pd.notes is null)
            order by pd.date_in desc
            limit ${(page-1)*5}, 5`
        } else {
            var sql = `select tp.product_name, tl.location_name, pd.quantity, pd.date_in, pd.status, pd.notes from tbl_product_detail pd
            join tbl_product tp on tp.product_id = pd.product_id
            join tbl_location tl on tl.location_id = pd.location_id
            where pd.location_id = ${db.escape(userLoc)} and !(pd.status in ('onPackaging') and pd.notes is null)`
        }

        db.query(sql, (err, activityRes)=> {
            if(err)return res.status(500).send(err)

            sql = `select count(*) as amountofact from tbl_product_detail pd
            join tbl_product tp on tp.product_id = pd.product_id
            join tbl_location tl on tl.location_id = pd.location_id
            where pd.location_id = ${db.escape(userLoc)} and !(pd.status in ('onPackaging') and pd.notes is null)`
            db.query(sql, (err, countAct)=> {
                if(err)return res.status(500).send(err)

                return res.send({activityRes: activityRes, countAct: countAct})
            })
        })
    },


    //========================================= TRANSACTION LOG ========================================

    getTrxUser: (req, res) => {
        let sql = `select trans.*, transdet.total_price from
        (select t.transaction_id, t.date_in, t.status, u.user_id, u.username, 
        t.payment_proof, t.method, t.location_id, l.location_name
        from tbl_transaction t join tbl_user u on t.user_id=u.user_id
        join tbl_location l on t.location_id=l.location_id) as trans
        join (select transaction_id, sum(price*quantity) as total_price
        from tbl_transaction_detail group by transaction_id) as transdet 
        on trans.transaction_id = transdet.transaction_id;`
        db.query(sql, (err, dataTrxUser)=>{
            if(err)return res.status(500).send(err)

            return res.send(dataTrxUser)
        })
    },

    getTrxDetailById: (req, res) => {
        const {id} = req.params // transaction_id
        let sql = `select td.*, p.product_name, p.image
        from tbl_transaction_detail td join tbl_product p on td.product_id=p.product_id
        where td.transaction_id=${db.escape(id)};`

        db.query(sql, (err, dataTrxDetailById)=>{
            if(err)return res.status(500).send(err)

            return res.send(dataTrxDetailById)
        })
    },

    getTrxTrackingById: (req, res) => {
        const {idTrx, idLoc} = req.params // transaction_id
        let sql = `select * from 
        (select td.transaction_detail_id, td.product_id, td.quantity, p.product_name, p.image
        from tbl_transaction_detail td join tbl_transaction t on td.transaction_id=t.transaction_id
        join tbl_product p on p.product_id = td.product_id
        where t.transaction_id = ${db.escape(idTrx)}) as tbl left join 
        (select product_id as prod_id, sum(pd.quantity) as stock_warehouse
        from  tbl_product_detail pd 
        where pd.location_id=${db.escape(idLoc)} and status != 'onPackaging' group by product_id) as apa on tbl.product_id = apa.prod_id;`

        db.query(sql, (err, dataTrxTrackingById)=>{
            if(err)return res.status(500).send(err)

            return res.send(dataTrxTrackingById)
        })
    },

    getSupplyFlow: (req, res) => {
        const {id} = req.params // transaction_detail_id
        let sql = `select n.*, l.location_name as destination_name
        from tbl_notification n join tbl_location l on n.destination=l.location_id
        where n.transaction_detail_id=${db.escape(id)} order by n.date_in;`

        db.query(sql, (err, dataSupplyById)=>{
            if(err)return res.status(500).send(err)

            return res.send(dataSupplyById)
        })
    },

    getPaymentCheck: (req, res) => {
        const {id} = req.params // transaction_id
        let sql = `select trans.*, transdet.total_price from
        (select t.transaction_id, t.date_in, t.status, u.user_id, u.username, 
        t.payment_proof, t.method, t.location_id, l.location_name
        from tbl_transaction t join tbl_user u on t.user_id=u.user_id
        join tbl_location l on t.location_id=l.location_id) as trans
        join (select transaction_id, sum(price*quantity) as total_price
        from tbl_transaction_detail group by transaction_id) as transdet 
        on trans.transaction_id = transdet.transaction_id where trans.transaction_id=${db.escape(id)};`

        db.query(sql, (err, dataPaymentCheck)=>{
            if(err)return res.status(500).send(err)

            return res.send({dataPaymentCheck: dataPaymentCheck[0]})
        })
    },

    acceptPaymentTrf: (req, res) => {
        const {id} = req.params
        let sql = `Select * from tbl_transaction where transaction_id = ${db.escape(id)}`
        db.query(sql, (err, results)=>{
            if(err){
                console.log(err)
                return res.status(500).send(err)
            }

            if(results.length){
                sql = `Update tbl_transaction set ? where transaction_id = ${db.escape(id)}`
                let dataUpdate = {
                    status: 'paymentCompleted',
                    notes:'noread'
                }
                db.query(sql, dataUpdate, (err)=>{
                    if(err)return res.status(500).send(err)
                    let insertLogTrans = {
                        activities: 'tbl_transaction',
                        status: dataUpdate.status,
                        date_in: Date.now(),
                        transaction_id: id
                    }
                    sql = `insert into tbl_log_transaction set ?`
                    db.query(sql, insertLogTrans, (err)=>{
                        if(err)return res.status(500).send(err)

                        let sql = `select trans.*, transdet.total_price from
                        (select t.transaction_id, t.date_in, t.status, u.user_id, u.username, 
                        t.payment_proof, t.method, t.location_id, l.location_name
                        from tbl_transaction t join tbl_user u on t.user_id=u.user_id
                        join tbl_location l on t.location_id=l.location_id) as trans
                        join (select transaction_id, sum(price*quantity) as total_price
                        from tbl_transaction_detail group by transaction_id) as transdet 
                        on trans.transaction_id = transdet.transaction_id;`
                        db.query(sql, (err, results)=>{
                            if(err)return res.status(500).send(err)
                            return res.status(200).send(results)
                        })
                    })
                    
                })
            }else{
                return res.status(500).send('transaction tidak ada')
            }
        })
    },

    rejectPaymentTrf: (req, res) => {
        const {id} = req.params
        let sql = `Select * from tbl_transaction where transaction_id = ${db.escape(id)}`
        db.query(sql, (err, results)=>{
            if(err){
                console.log(err)
                return res.status(500).send(err)
            }

            if(results.length){
                sql = `Update tbl_transaction set ? where transaction_id = ${db.escape(id)}`
                let dataUpdate = {
                    status: 'paymentRejected'
                }
                db.query(sql, dataUpdate, (err)=>{
                    if(err)return res.status(500).send(err)
                    
                    let sql = `select trans.*, transdet.total_price from
                    (select t.transaction_id, t.date_in, t.status, u.user_id, u.username, 
                    t.payment_proof, t.method, t.location_id, l.location_name
                    from tbl_transaction t join tbl_user u on t.user_id=u.user_id
                    join tbl_location l on t.location_id=l.location_id) as trans
                    join (select transaction_id, sum(price*quantity) as total_price
                    from tbl_transaction_detail group by transaction_id) as transdet 
                    on trans.transaction_id = transdet.transaction_id;`
                    db.query(sql, (err, results)=>{
                        if(err)return res.status(500).send(err)
                        return res.status(200).send(results)
                    })
                })
            }else{
                return res.status(500).send('transaction tidak ada')
            }
        })
    }

}

