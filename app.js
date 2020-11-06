// load libraries
const express = require('express')
const fetch = require('node-fetch')
const withQuery = require('with-query').default

// MYSQL
const SELECT_BY_TITLE_FIRST = "SELECT * FROM book2018 WHERE title LIKE ? ORDER BY title ASC LIMIT ? OFFSET ?"
const COUNT_TITLES_FIRST = "SELECT count(title) as count FROM book2018 WHERE title LIKE ?"
const SELECT_BY_ID = "SELECT * FROM book2018 WHERE book_id = ?"
const LIMIT = 10

// declare variables
const alphabets = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']
const numbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

// NY TIME API
const API_KEY = process.env.NYTIME_API
const ENDPOINT = 'https://api.nytimes.com/svc/books/v3/reviews.json'

module.exports = (p) => {
    // declare router and pool
    const router = express.Router()
    const pool = p

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
                // catch error
                return Promise.reject(e)            
            }
            finally {
                // release the connection to mysql
                conn.release()
            }
        }
        return f
    }

    function getNYdata (title) {
        // form url using withquery
        const URL = withQuery(ENDPOINT, {
                'api-key': API_KEY,
                title
            }    
        )
        // fetch promise data using node-fetch and .then
        const data = fetch(URL)
            .then ((d) => {
                // get json data which returns another promise
                const dataArray = d.json()
                return dataArray
            })
            .then ((f) => {
                // return the data f
                return f
            })
            .catch ((e) => {
                // catch error
                console.error("Error fetching URL: ", e)
            })
        
        // return data after it has completed the promise
        return data
    }

    // Queries
    const getTitleByFirst = mkQuery(SELECT_BY_TITLE_FIRST, pool)
    const getTitleID = mkQuery(SELECT_BY_ID, pool)
    const GetTitleCount = mkQuery(COUNT_TITLES_FIRST, pool)

    // #### GET routes ####
    // ## GET reviews by title ##
    router.get('/reviews/:title', async (req, resp) => {
        const root = req.baseUrl
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
                book_title,
                root
            }
        )
    })

    // ## GET book by id ##
    router.get('/detailed/:bookid', async (req, resp) => {
        const root = req.baseUrl
        const bookid = req.params.bookid
        const result = await getTitleID(bookid)
        if (result[0] == undefined)
        {
            // error 404 book id url not found
            resp.redirect(`/main/${bookid}/error`)
            return
        }
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
                        genres,
                        root
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

    // ## GET search results  ##
    router.get('/search', async (req, resp) => {
        const root = req.baseUrl
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
                checkMax: !(pageTrack + 1 > totalPages),
                root
            }
        )
    })

    // ## GET landing page aka home page ##
    router.get('/', (req, resp) => {
        const root = req.baseUrl
        resp.status(200)
        resp.type('text/html')
        resp.render('landing',
            {
                title: '| My Booksearch|',
                alphabets,
                numbers,
                root
            }
        )
    })

    // #### ERROR ####
    router.get('/:id/error', (req, resp) => {
        resp.status(404)
        resp.type('text/html')
        resp.sendFile(`${__dirname}/static/error404.html`)
    })

    // ## REDIRECT ## if user types some funny url
    router.use((req, resp) => {
        resp.redirect('/')
    })

    // return router back to main.js
    return router
}