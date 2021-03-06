const authControllers = require('./authControllers')
const AdminControllers = require('./AdminControllers')
const CartControllers = require('./CartControllers')
const TransactionControllers = require('./TransactionControllers')
const NotificationControllers = require('./NotificationControllers')
const ReportControllers = require('./ReportControllers')
const UserOrdersControllers = require('./UserOrdersControllers')

module.exports = {
    authControllers,
    AdminControllers,
    CartControllers,
    TransactionControllers,
    NotificationControllers,
    ReportControllers,
    UserOrdersControllers
}