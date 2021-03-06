const authRoutes = require('./authRoutes')
const AdminRoutes = require('./AdminRoutes')

module.exports = {
    authRoutes,
    AdminRoutes,
    CartRoutes: require('./CartRoutes'),
    TransactionRoutes: require('./TransactionRoutes'),
    NotificationRoutes: require('./NotificationRoutes'),
    ReportRoutes: require('./ReportRoutes'),
    UserOrdersRoutes : require('./UserOrdersRoutes')
}