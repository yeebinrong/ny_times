// load libraries
const express = require('express')
const handlebars = require('express-handlebars')
const mysql = require('mysql2/promise')
const fetch = require('node-fetch')
const withQuery = require('with-query').default
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

// MYSQL
const SELECT_BY_TITLE_FIRST = "SELECT * FROM book2018 WHERE title LIKE ? ORDER BY title ASC LIMIT ? OFFSET ?"
const COUNT_TITLES_FIRST = "SELECT count(title) as count FROM book2018 WHERE title LIKE ?"
const SELECT_BY_ID = "SELECT * FROM book2018 WHERE book_id = ?"

// declare variables
const alphabets = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']
const numbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
const LIMIT = 10

// NY TIME API
const API_KEY = process.env.NYTIME_API
const ENDPOINT = 'https://api.nytimes.com/svc/books/v3/reviews.json'

// ### FUNCTIONS ####
const mkQuery = (sqlStmt, pool) => {
    const f = async (params) => {
        // get a connection from pool
        const conn = await pool.getConnection()
        
        try {
            // Execute the query with the parameter
            const results = await conn.query(sqlStmt, params)
            return results[0]
        } 
        catch (e) {
            return Promise.reject(e)            
        }
        finally {
            conn.release()
        }
    }
    return f
}

function getNYdata (title) {
    const URL = withQuery(ENDPOINT,
        {
            'api-key': API_KEY,
            title
        }    
    )

    const data = fetch(URL)
        .then ((d) => {
            const dataArray = d.json()
            return dataArray
        })
        .then ((f) => {
            return f
        })
        .catch ((e) => {
            console.error("Error fetching URL: ", e)
        })

    return data
}

// Queries
const getTitleByFirst = mkQuery(SELECT_BY_TITLE_FIRST, pool)
const getTitleID = mkQuery(SELECT_BY_ID, pool)
const GetTitleCount = mkQuery(COUNT_TITLES_FIRST, pool)

// declare port
const PORT = parseInt(process.argv[2]) || parseInt(process.env.PORT) || 3000

// load resources
app.use(express.static(`${__dirname}/static`))

// LOGGER
app.use(morgan('combined'))

// #### GET routes ####
app.get('/reviews/:title', async (req, resp) => {
    let title = req.params.title
    book_title = title.replace(/%20/g, ' ')
    const reviews = await getNYdata(title)
    resp.status(200)
    resp.type('text/html')
    resp.render('review',
        {
            title: '| Reviews |',
            qty: reviews.num_results,
            reviews: reviews.results,
            book_title
        }
    )
})

app.get('/detailed/:bookid', async (req, resp) => {
    const bookid = req.params.bookid
    const result = await getTitleID(bookid)
    let authors = result[0].authors
    let genres = result[0].genres
    authors = authors.replace(/\|/g, ', ') 
    genres = genres.replace(/\|/g, ', ')

    resp.format({
        'text/html': () => {
            resp.status(200)
            resp.type('text/html')
            resp.render('detailed',
                {
                    title: '| Detail |',
                    result: result[0],
                    authors,
                    genres
                }
            )
        },
        'application/json': () => {
            resp.status(200)
            resp.type('application/json')
            resp.send(result[0])
        },
        default: () => {
            // log the request and respond with 406
            resp.status(406).send('Not Acceptable')
        }
      })
})

app.get('/search', async (req, resp) => {
    const offset = parseInt(req.query.offset) || 0
    const q = req.query.q
    const param = q + '%'
    const titlesData = await getTitleByFirst([param, LIMIT, offset])
    const titlesCount = await GetTitleCount(param)
    const totalTitles = titlesCount[0]['count']
    const totalPages = Math.ceil(totalTitles / LIMIT)
    const pageTrack = (offset / LIMIT) + 1 // actual page is +1

    resp.status(200)
    resp.type('text/html')
    resp.render('search',
        {
            title: '| Searching |',
            q,
            titlesData,
            prevOffset: Math.max(offset - LIMIT, 0),
            nextOffset: offset + LIMIT,
            checkZero: pageTrack - 1,
            checkMax: !(pageTrack + 1 > totalPages)
        }
    )
})

app.get('/', (req, resp) => {
    resp.status(200)
    resp.type('text/html')
    resp.render('landing',
        {
            title: '| My Bookstore |',
            alphabets,
            numbers
        }
    )
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