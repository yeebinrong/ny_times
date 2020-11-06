// load libraries
const express = require('express')
const handlebars = require('express-handlebars')
const mysql = require('mysql2/promise')
const morgan = require('morgan')

// create an instance of express
const app = express()

// configure handlebars
app.engine('hbs',
    handlebars({defaultLayout : 'template.hbs'})
)
app.set('view engine', 'hbs')

// create database pool connection
const pool = mysql.createPool({
    host: process.env.SQL_HOST || 'localhost',
    port: parseInt(process.env.SQL_PORT || 3306),
    database: process.env.SQL_DB || 'goodreads',
    user: process.env.SQL_USER,
    password: process.env.SQL_PASS,
    connectionLimit: parseInt(process.env.SQL_CONNECTION_LIMIT) || 4,
    timezone: '+08:00'
})

// declare router
const router = require('./app')(pool)

// declare port
const PORT = parseInt(process.argv[2]) || parseInt(process.env.PORT) || 3000

// load resources
app.use(express.static(`${__dirname}/static`))

// ## LOGGER ##
app.use(morgan('combined'))

// #### MAIN ROUTER ####
app.use('/main', router)

// ## REDIRECT ## if user types wrong url
app.use((req, resp) => {
    resp.redirect('/main')
})

// initalise the app
const startApp = async (app, pool) => {
    try {
        // get connection from db
        const conn = await pool.getConnection()
        console.info('Pinging database...')
        await conn.ping()

        //release connection
        conn.release()

        // listen for port
        app.listen(PORT, () => {
            console.info(`Application is listening to PORT ${PORT} at ${new Date()}.`)
        })
    } 
    catch (e) {
        console.error("Error pinging database! ", e)
    }
}

// start server
startApp(app, pool)