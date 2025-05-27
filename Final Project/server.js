/*
Server.js
  * Base Code from Answer Code Tutorial 9 from LD Nell COMP 2406 Class
  * Sets up the Express server, with middleware, routes and error handlings for a book review web app


*/



const express = require('express')
const path = require('path')
const favicon = require('serve-favicon')
const logger = require('morgan')
const bodyParser = require('body-parser')
const routes = require('./routes/index')
const cookieParser = require('cookie-parser');

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(bodyParser.urlencoded({ extended: false }))
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')))
app.use(logger('dev'))
app.use(express.static(path.join(__dirname, 'public')))


// Authentication middleware
app.use((req, res, next) => {
  if (req.path === '/' || 
      req.path === '/index.html' || 
      req.path.startsWith('/public/') ||
      req.path === '/login-auth') {
    return next()
  }
  routes.authenticate(req, res, next)
})

// Routes
app.get('/', routes.index);
app.get('/index.html', routes.index);
app.post('/login', routes.handleLogin); 
app.post('/register', routes.handleRegister);
app.get('/users', routes.checkAdmin, routes.users);
app.get('/dashboard', routes.dashboard);
app.get('/api/books/search', routes.searchBooks);
app.post('/api/reviews', routes.postReview);
app.get('/api/reviews/all', routes.getAllReviews);
app.get('/api/reviews', routes.getReviews);
app.get('/protected', routes.protected);

app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).send('Something broke!')
})



// Start server
app.listen(PORT, err => {
  if (err) {
    console.error(err)
  } else {
    console.log(`Server listening on port: ${PORT} CNTL:-C to stop`)
    console.log('To Test:')
    console.log('http://localhost:3000/')
    console.log('Test users:')
    console.log('admin: ldnel / secret')
    console.log('guest: alisha / password')
  }
})