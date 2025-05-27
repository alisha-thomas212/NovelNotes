/*
Index.js

  * Implements a book review web app with:
      - user authentication 
      - role based access (admin and guest users)
      - user registration 
      - book search using Google Books API
      - Creaye and read reviews 
      - Admin dashboard

*/

const url = require('url');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('data/db_1200iRealSongs');
const https = require('https');

// Paths to template files
const headerFilePath = __dirname + '/../views/header.html';
const footerFilePath = __dirname + '/../views/footer.html';

// Initialize database
db.serialize(function() {
  db.run("CREATE TABLE IF NOT EXISTS users (userid TEXT PRIMARY KEY, password TEXT, role TEXT)");
  db.run("INSERT OR REPLACE INTO users VALUES ('ldnel', 'secret', 'admin')");
  db.run("INSERT OR REPLACE INTO users VALUES ('frank', 'secret2', 'guest')");
  db.run(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL,
      book_title TEXT NOT NULL,
      book_author TEXT,
      book_thumbnail TEXT,
      user_id TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// =================== Helper functions ===================//
function handleError(response, err) {
  console.log('ERROR: ' + JSON.stringify(err));
  response.writeHead(404);
  response.end(JSON.stringify(err));
}

function parseURL(request, response) {
  const PARSE_QUERY = true;
  const SLASH_HOST = true;
  let urlObj = url.parse(request.url, PARSE_QUERY, SLASH_HOST);
  console.log('path:', urlObj.path);
  console.log('query:', urlObj.query);
  return urlObj;
}

function renderPage(response, content) {
  fs.readFile(headerFilePath, (err, headerData) => {
    if (err) return handleError(response, err);
    
    response.writeHead(200, {'Content-Type': 'text/html'});
    response.write(headerData);
    response.write(content);
    
    fs.readFile(footerFilePath, (err, footerData) => {
      if (err) return handleError(response, err);
      response.write(footerData);
      response.end();
    });
  });
}



// ========================= Login/Register ======================= //

// Authentication Middleware: uses basic auth 
exports.authenticate = function(request, response, next) {
  if (request.path === '/' || request.path === '/index.html') {
    return next();
  }

  const auth = request.headers.authorization;
  if (!auth) {
    response.setHeader('WWW-Authenticate', 'Basic realm="Need to login"');
    return response.status(401).send('Unauthorized');
  }

  const [type, encoded] = auth.split(' ');
  if (type !== 'Basic' || !encoded) {
    return response.status(400).send('Invalid authentication format');
  }

  const decoded = Buffer.from(encoded, 'base64').toString();
  const [username, password] = decoded.split(':');

  db.get("SELECT userid, password, role FROM users WHERE userid = ?", [username], (err, row) => {
    if (err) {
      console.error("Database error:", err);
      return response.status(500).send('Internal server error');
    }
    
    if (!row || row.password !== password) {
      response.setHeader('WWW-Authenticate', 'Basic realm="Need to login"');
      return response.status(401).send('Invalid credentials');
    }

    request.user = {
      userid: row.userid,
      role: row.role,
    };

    next();
  });
};

// Register Handler: checking if username is avliable and storing new login info in database
exports.handleRegister = function(request, response) {
  const { username, password } = request.body;

  if (!username || !password) {
    return response.redirect('/index.html?message=' + encodeURIComponent('Username and password are required'));
  }

  db.get("SELECT userid FROM users WHERE userid = ?", [username], (err, row) => {
    if (err) {
      console.error("Database error:", err);
      return response.redirect('/index.html?message=' + encodeURIComponent('Database error, try again.'));
    }

    if (row) {
      return response.redirect('/index.html?message=' + encodeURIComponent('Username already taken'));
    }

    db.run("INSERT INTO users (userid, password, role) VALUES (?, ?, ?)", [username, password, 'guest'], function(err) {
      if (err) {
        console.error("Database insert error:", err);
        return response.redirect('/index.html?message=' + encodeURIComponent('Error registering user'));
      }

      console.log("User registered:", username);
      response.redirect('/index.html?message=' + encodeURIComponent('Registration successful! Please log in.'));
    });
  });
};

// Login Handler: checks login info with database and redirects depending on role 
exports.handleLogin = function(request, response) {
  const { username, password } = request.body;

  if (!username || !password) {
    return response.redirect('/index.html?message=' + encodeURIComponent('Username and password are required'));
  }

  db.get("SELECT userid, password, role FROM users WHERE userid = ?", [username], (err, row) => {
    if (err) {
      console.error("Database error:", err);
      return response.redirect('/index.html?message=' + encodeURIComponent('Database error, try again.'));
    }

    if (!row || row.password !== password) {
      return response.redirect('/index.html?message=' + encodeURIComponent('Invalid username or password'));
    }

    console.log("User logged in:", username);

    if (row.role === 'admin') {
      response.setHeader('Set-Cookie', `isAdmin=true; Path=/; HttpOnly`);
      return response.redirect('/users');
    } else {
      response.setHeader('Set-Cookie', `isAdmin=; Path=/; HttpOnly; Max-Age=0`);
      return response.redirect('/dashboard');
    }
  });
};

// Admin Check Middleware
exports.checkAdmin = function(request, response, next) {
  if (!request.user) {
    response.setHeader('WWW-Authenticate', 'Basic realm="Admin access required"');
    return response.status(401).send('Unauthorized');
  }

  if (request.user.role !== 'admin') {
    response.writeHead(403, { 'Content-Type': 'text/html' });
    return response.end('<h2>ERROR: Admin Privileges Required To See Users</h2>');
  }

  next();
};

// Protected Route
exports.protected = function(request, response) {
  if (request.user.role === 'admin') {
    return response.redirect('/users');
  } else {
    return response.redirect('/dashboard');
  }
};



// ========================== Pages ======================= //

// Home Page: renders  a registration page
exports.index = function(request, response) {
  const message = request.query.message ? 
    `<div class="message">${decodeURIComponent(request.query.message)}</div>` : '';

  const content = `
    <style>
      .auth-container {
        max-width: 400px;
        margin: 2rem auto;
        padding: 1.5rem;
        border: 1px solid #ddd;
        border-radius: 8px;
        background: #f9f9f9;
      }
      .form-group {
        margin-bottom: 1rem;
      }
      label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: bold;
      }
      input[type="text"],
      input[type="password"] {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid #ddd;
        border-radius: 4px;
      }
      button {
        background: #4CAF50;
        color: white;
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        margin-right: 0.5rem;
      }
      button:hover {
        background: #45a049;
      }
      .message {
        padding: 1rem;
        background: #e9f7ef;
        border-left: 4px solid #4CAF50;
        margin-bottom: 1.5rem;
      }
      .login-link {
        margin-top: 1rem;
        display: block;
      }
    </style>
    
    ${message}
    
    <div class="auth-container">
      <h2>Register</h2>
      <form action="/register" method="post">
        <div class="form-group">
          <label for="reg-username">Username:</label>
          <input type="text" id="reg-username" name="username" required>
        </div>
        <div class="form-group">
          <label for="reg-password">Password:</label>
          <input type="password" id="reg-password" name="password" required>
        </div>
        <button type="submit">Register</button>
      </form>
      <a href="/protected" class="login-link">Already have an account? Login</a>
    </div>
  `;

  renderPage(response, content);
};

// Admin Users Page
exports.users = function(request, response) {
  if (!request.user || request.user.role !== 'admin') {
    response.writeHead(403, {'Content-Type': 'text/html'});
    return response.end('<h2>ERROR: Admin Privileges Required To See Users</h2>');
  }

  db.all("SELECT userid, password, role FROM users", function(err, users) {
    if (err) return handleError(response, err);
    
    db.all(`
      SELECT 
        r.id, r.book_id, r.book_title, r.book_author, r.book_thumbnail,
        r.rating, r.comment, r.created_at, u.userid AS username
      FROM reviews r
      JOIN users u ON r.user_id = u.userid
      ORDER BY r.created_at DESC
    `, function(err, reviews) {
      if (err) return handleError(response, err);

      let content = `
        <style>
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 1rem 0;
          }
          th, td {
            padding: 0.75rem;
            border: 1px solid #ddd;
            text-align: left;
          }
          th {
            background-color: #f2f2f2;
          }
          .review-item {
            border: 1px solid #ddd;
            padding: 1rem;
            margin-bottom: 1rem;
            border-radius: 5px;
            display: flex;
            gap: 1rem;
            align-items: center;
          }
          .review-thumbnail {
            height: 100px;
            width: auto;
            border: 1px solid #eee;
          }
          .no-image {
            height: 100px;
            width: 80px;
            background: #f0f0f0;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .gold-star {
            color: gold;
          }
        </style>

        <h1>Admin Dashboard</h1>
        <h2>All Users</h2>
        <table>
          <tr>
            <th>Username</th>
            <th>Password</th>
            <th>Role</th>
          </tr>
          ${users.map(user => `
            <tr>
              <td>${user.userid}</td>
              <td>${user.password}</td>
              <td>${user.role}</td>
            </tr>
          `).join('')}
        </table>

        <h2>All Reviews</h2>
        <div>
          ${reviews.length > 0 ? reviews.map(review => `
            <div class="review-item">
              ${review.book_thumbnail 
                ? `<img src="${review.book_thumbnail}" class="review-thumbnail">`
                : '<div class="no-image">No image</div>'}
              <div style="flex-grow:1;">
                <strong>${review.username}</strong> reviewed <em>${review.book_title}</em><br>
                <span class="gold-star">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</span>
                <p>${review.comment}</p>
                <small>Reviewed on: ${new Date(review.created_at).toLocaleString()}</small>
              </div>
            </div>
          `).join('') : '<p>No reviews yet.</p>'}
        </div>
      `;

      renderPage(response, content);
    });
  });
};

// Dashboard Page
exports.dashboard = function(request, response) {
  if (!request.user) {
    return response.redirect('/?message=Please+login+first');
  }

  db.all(`
    SELECT 
      r.*,
      u.userid as username
    FROM reviews r
    JOIN users u ON r.user_id = u.userid
    ORDER BY r.created_at DESC
  `, [], (err, reviews) => {
    if (err) {
      console.error('Database error:', err);
      return renderPage(response, '<div class="error">Failed to load reviews</div>');
    }

    const content = `
      <style>
        .search-container {
          margin: 2rem 0;
          display: flex;
          gap: 1rem;
        }
        #search {
          flex-grow: 1;
          padding: 0.5rem;
        }
        #search-button {
          padding: 0.5rem 1rem;
        }
        .review-card {
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
        }
        .review-header {
          display: flex;
          gap: 1.5rem;
          margin-bottom: 1rem;
        }
        .book-cover {
          height: 120px;
          width: auto;
          border: 1px solid #eee;
        }
        .no-cover {
          height: 120px;
          width: 80px;
          background: #f0f0f0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .star-rating {
          color: gold;
          font-size: 1.2em;
          margin: 0.5rem 0;
        }
        .review-content {
          background: #f8f8f8;
          padding: 1rem;
          border-radius: 5px;
        }
        .review-meta {
          color: #666;
          font-size: 0.9em;
          margin-top: 0.5rem;
        }
        #review-section {
          display: none;
          margin: 2rem 0;
          padding: 1.5rem;
          background: #fff;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .star {
          font-size: 1.5em;
          color: #ccc;
          cursor: pointer;
          margin-right: 0.3rem;
        }
        .star:hover, .star.active {
          color: gold;
        }
        textarea {
          width: 100%;
          min-height: 150px;
          padding: 1rem;
          margin: 1rem 0;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        .submit-btn {
          background: #4CAF50;
          color: white;
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
      </style>

      <h1>Dashboard</h1>
      <p>Welcome, ${request.user.userid}!</p>
      
      <div class="search-container">
        <input type="text" id="search" placeholder="Search for books...">
        <button id="search-button">Search</button>
      </div>
      
      <div id="search-results"></div>
      
      <div id="review-section">
        <h2>Add Your Review</h2>
        <div id="selected-book"></div>
        <div>
          <label>Rating:</label>
          <div id="star-rating">
            <span class="star" data-rating="1">☆</span>
            <span class="star" data-rating="2">☆</span>
            <span class="star" data-rating="3">☆</span>
            <span class="star" data-rating="4">☆</span>
            <span class="star" data-rating="5">☆</span>
            <input type="hidden" id="rating" value="0">
          </div>
        </div>
        <textarea id="comment" placeholder="Write your review here..." required></textarea>
        <button id="submit-review" class="submit-btn">Submit Review</button>
      </div>
      
      <h2>All Reviews</h2>
      <div id="reviews-list">
        ${reviews.length > 0 ? reviews.map(review => `
          <div class="review-card">
            <div class="review-header">
              ${review.book_thumbnail 
                ? `<img src="${review.book_thumbnail}" class="book-cover">`
                : '<div class="no-cover">No cover</div>'}
              <div>
                <h3>${review.book_title}</h3>
                <p>${review.book_author || 'Unknown author'}</p>
              </div>
            </div>
            <div class="review-content">
              <div class="star-rating">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</div>
              <p>${review.comment}</p>
              <div class="review-meta">
                Reviewed by ${review.username} on ${new Date(review.created_at).toLocaleString()}
              </div>
            </div>
          </div>
        `).join('') : '<p>No reviews yet. Be the first to review!</p>'}
      </div>

      <script>
        // Star Rating Functionality
        document.querySelectorAll('#star-rating .star').forEach(star => {
          star.addEventListener('click', function() {
            const rating = parseInt(this.dataset.rating);
            document.getElementById('rating').value = rating;
            
            // Update star display
            document.querySelectorAll('#star-rating .star').forEach((s, i) => {
              s.textContent = i < rating ? '★' : '☆';
              s.classList.toggle('active', i < rating);
            });
          });
        });

        // Search Functionality
        document.getElementById('search-button').addEventListener('click', searchBooks);
        document.getElementById('search').addEventListener('keypress', function(e) {
          if (e.key === 'Enter') searchBooks();
        });

        function searchBooks() {
          const query = document.getElementById('search').value;
          if (!query) return alert('Please enter a search term');
          
          document.getElementById('search-results').innerHTML = 'Searching...';
          
          fetch('/api/books/search?q=' + encodeURIComponent(query))
            .then(res => res.json())
            .then(books => {
              let html = '';
              books.forEach(book => {
                html += \`
                  <div style="margin:1rem; padding:1rem; border:1px solid #ddd; cursor:pointer;" 
                       class="book-result" 
                       data-id="\${book.id}" 
                       data-title="\${book.title}" 
                       data-authors="\${book.authors.join(', ')}" 
                       data-thumbnail="\${book.thumbnail || ''}">
                    <h3>\${book.title}</h3>
                    <p>\${book.authors.join(', ')}</p>
                    \${book.thumbnail ? \`<img src="\${book.thumbnail}" height="100">\` : ''}
                  </div>
                \`;
              });
              document.getElementById('search-results').innerHTML = html || 'No books found';
              
              // Add click handlers to book results
              document.querySelectorAll('.book-result').forEach(bookEl => {
                bookEl.addEventListener('click', function() {
                  document.getElementById('selected-book').innerHTML = \`
                    <div style="display:flex; gap:1rem; align-items:center; margin-bottom:1rem;">
                      \${this.dataset.thumbnail 
                        ? \`<img src="\${this.dataset.thumbnail}" height="120">\`
                        : '<div style="height:120px; width:80px; background:#f0f0f0;"></div>'}
                      <div>
                        <h3>\${this.dataset.title}</h3>
                        <p>\${this.dataset.authors}</p>
                      </div>
                    </div>
                  \`;
                  document.getElementById('review-section').style.display = 'block';
                  document.getElementById('rating').value = 0;
                  document.querySelectorAll('#star-rating .star').forEach(s => {
                    s.textContent = '☆';
                    s.classList.remove('active');
                  });
                  document.getElementById('comment').value = '';
                });
              });
            })
            .catch(err => {
              console.error(err);
              document.getElementById('search-results').innerHTML = 'Search failed';
            });
        }

        // Submit Review
        document.getElementById('submit-review').addEventListener('click', submitReview);

        function submitReview() {
          const bookId = document.querySelector('.book-result')?.dataset.id;
          const bookTitle = document.querySelector('.book-result')?.dataset.title;
          const bookAuthor = document.querySelector('.book-result')?.dataset.authors;
          const bookThumbnail = document.querySelector('.book-result')?.dataset.thumbnail;
          const rating = document.getElementById('rating').value;
          const comment = document.getElementById('comment').value;

          if (!bookId || !rating || !comment) {
            return alert('Please select a book, provide a rating, and write a comment');
          }

          fetch('/api/reviews', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              book_id: bookId,
              book_title: bookTitle,
              book_author: bookAuthor,
              book_thumbnail: bookThumbnail,
              rating: parseInt(rating),
              comment: comment,
              user_id: '${request.user.userid}'
            })
          })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              location.reload(); // Refresh to show new review
            } else {
              alert('Failed to submit review: ' + (data.error || 'Unknown error'));
            }
          })
          .catch(err => {
            console.error('Error:', err);
            alert('Failed to submit review');
          });
        }
      </script>
    `;

    renderPage(response, content);
  });
  
};



// ===================== Reviews ===================== //

//displays a book review form with star ratings, book details
exports.showReviewForm = function(request, response) {
  if (!request.user) {
    return response.redirect('/?message=Please+login+first');
  }

  const bookId = request.query.book_id;
  if (!bookId) {
    return renderPage(response, '<div class="error">Book ID is required</div>');
  }

  // Fetch book details from Google Books API
  const options = {
    hostname: 'www.googleapis.com',
    path: `/books/v1/volumes/${bookId}`,
    method: 'GET'
  };

  https.request(options, (apiResponse) => {
    let data = '';
    apiResponse.on('data', (chunk) => data += chunk);
    apiResponse.on('end', () => {
      try {
        const book = JSON.parse(data);
        const thumbnail = book.volumeInfo.imageLinks?.thumbnail || '';
        
        const content = `
          <style>
            .review-container {
              max-width: 800px;
              margin: 2rem auto;
              padding: 2rem;
              background: #fff;
              border-radius: 8px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .book-header {
              display: flex;
              gap: 2rem;
              margin-bottom: 2rem;
              align-items: center;
            }
            .book-cover {
              max-height: 200px;
              border: 1px solid #ddd;
            }
            .star-rating {
              margin: 1rem 0;
            }
            .star {
              font-size: 2rem;
              color: #ccc;
              cursor: pointer;
              margin-right: 0.5rem;
              transition: color 0.2s;
            }
            .star:hover, .star.active {
              color: gold;
            }
            textarea {
              width: 100%;
              min-height: 150px;
              padding: 1rem;
              border: 1px solid #ddd;
              border-radius: 4px;
              font-family: inherit;
            }
            .submit-btn {
              background: #4CAF50;
              color: white;
              padding: 0.75rem 1.5rem;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 1rem;
              margin-top: 1rem;
            }
            .error {
              color: #f44336;
              margin: 1rem 0;
            }
          </style>

          <div class="review-container">
            <div class="book-header">
              ${thumbnail ? `<img src="${thumbnail}" class="book-cover">` : ''}
              <div>
                <h1>Review: ${book.volumeInfo.title}</h1>
                <p>by ${book.volumeInfo.authors?.join(', ') || 'Unknown author'}</p>
              </div>
            </div>

            <form action="/submit-review" method="POST">
              <input type="hidden" name="book_id" value="${bookId}">
              <input type="hidden" name="book_title" value="${book.volumeInfo.title}">
              <input type="hidden" name="book_author" value="${book.volumeInfo.authors?.join(', ') || ''}">
              <input type="hidden" name="book_thumbnail" value="${thumbnail}">

              <div class="form-group">
                <label><strong>Your Rating:</strong></label>
                <div class="star-rating">
                  ${[1,2,3,4,5].map(i => `
                    <span class="star" data-rating="${i}" onclick="setRating(${i})">☆</span>
                  `).join('')}
                  <input type="hidden" name="rating" id="rating-input" value="0" required>
                </div>
              </div>

              <div class="form-group">
                <label><strong>Your Review:</strong></label>
                <textarea name="comment" placeholder="Share your thoughts about this book..." required></textarea>
              </div>

              <button type="submit" class="submit-btn">Submit Review</button>
            </form>

            <script>
              function setRating(rating) {
                // Update stars display
                document.querySelectorAll('.star').forEach((star, index) => {
                  star.textContent = index < rating ? '★' : '☆';
                  star.classList.toggle('active', index < rating);
                });
                
                // Update hidden input value
                document.getElementById('rating-input').value = rating;
              }
            </script>
          </div>
        `;

        renderPage(response, content);
      } catch (error) {
        console.error('Error parsing book data:', error);
        renderPage(response, `
          <div class="error">
            <p>Failed to load book details. Please try again later.</p>
            <a href="/dashboard">Return to Dashboard</a>
          </div>
        `);
      }
    });
  }).on('error', (error) => {
    console.error('API request failed:', error);
    renderPage(response, `
      <div class="error">
        <p>Could not connect to book service. Please try again later.</p>
        <a href="/dashboard">Return to Dashboard</a>
      </div>
    `);
  }).end();
};

exports.handleReviewSubmission = function(request, response) {
  if (!request.user) {
    return response.redirect('/?message=Please+login+first');
  }

  let body = '';
  request.on('data', chunk => body += chunk.toString());
  request.on('end', () => {
    try {
      const reviewData = Object.fromEntries(new URLSearchParams(body));
      const userId = request.user.userid;

      if (!reviewData.rating || !reviewData.comment) {
        return renderPage(response, `
          <div class="error">
            <p>Rating and comment are required.</p>
            <a href="javascript:history.back()">Go back</a>
          </div>
        `);
      }

      db.run(
        `INSERT INTO reviews 
        (book_id, book_title, book_author, book_thumbnail, user_id, rating, comment) 
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          reviewData.book_id,
          reviewData.book_title,
          reviewData.book_author || 'Unknown',
          reviewData.book_thumbnail || '',
          userId,
          reviewData.rating,
          reviewData.comment
        ],
        function(err) {
          if (err) {
            console.error('Database error:', err);
            return renderPage(response, `
              <div class="error">
                <p>Failed to save review. Please try again.</p>
                <a href="javascript:history.back()">Go back</a>
              </div>
            `);
          }
          
          response.redirect('/dashboard?message=Review+submitted+successfully');
        }
      );
    } catch (error) {
      console.error('Error processing review:', error);
      renderPage(response, `
        <div class="error">
          <p>An error occurred. Please try again.</p>
          <a href="/dashboard">Return to Dashboard</a>
        </div>
      `);
    }
  });
};

// user serach and returns book results 
exports.searchBooks = function(request, response) {
  const query = request.query.q;
  if (!query) {
    return response.status(400).json({ error: 'Search query required' });
  }

  const options = {
    hostname: 'www.googleapis.com',
    path: `/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5`,
    method: 'GET'
  };

  const apiRequest = https.request(options, (apiResponse) => {
    let data = '';
    
    apiResponse.on('data', (chunk) => {
      data += chunk;
    });

    apiResponse.on('end', () => {
      try {
        const result = JSON.parse(data);
        const books = result.items?.map(item => ({
          id: item.id,
          title: item.volumeInfo.title,
          authors: item.volumeInfo.authors || ['Unknown'],
          thumbnail: item.volumeInfo.imageLinks?.thumbnail
        })) || [];
        
        response.json(books);
      } catch (error) {
        console.error('Error processing API response:', error);
        response.status(500).json({ error: 'Failed to process book data' });
      }
    });
  });

  apiRequest.on('error', (error) => {
    console.error('API Request Error:', error);
    response.status(500).json({ error: 'Failed to connect to books API' });
  });

  apiRequest.end();
};

exports.getAllReviews = function(request, response) {
  db.all(`
    SELECT 
      r.*,
      u.userid as username
    FROM reviews r
    JOIN users u ON r.user_id = u.userid
    ORDER BY r.created_at DESC
  `, [], (err, reviews) => {
    if (err) {
      console.error('Database error:', err);
      return response.status(500).json({ error: 'Failed to fetch reviews' });
    }
    response.json(reviews || []);
  });
};

exports.postReview = function(request, response) {
  let body = '';
  request.on('data', chunk => body += chunk.toString());
  request.on('end', () => {
    try {
      const reviewData = JSON.parse(body);
      const userId = request.user.userid;

      if (!userId) {
        return response.status(401).json({ error: 'Not authenticated' });
      }

      db.run(
        `INSERT INTO reviews 
        (book_id, book_title, book_author, book_thumbnail, user_id, rating, comment) 
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          reviewData.book_id,
          reviewData.book_title,
          reviewData.book_author || 'Unknown',
          reviewData.book_thumbnail || '',
          userId,
          reviewData.rating,
          reviewData.comment
        ],
        function(err) {
          if (err) {
            console.error('Database error:', err);
            return response.status(500).json({ error: 'Database error' });
          }
          
          db.get(`
            SELECT r.*, u.userid as username
            FROM reviews r
            JOIN users u ON r.user_id = u.userid
            WHERE r.id = ?
          `, [this.lastID], (err, newReview) => {
            if (err || !newReview) {
              return response.status(500).json({ error: 'Failed to fetch new review' });
            }
            response.json({ 
              success: true, 
              review: newReview 
            });
          });
        }
      );
    } catch (error) {
      console.error('Parse error:', error);
      response.status(400).json({ error: 'Invalid JSON data' });
    }
  });
};

exports.getReviews = function(request, response) {
  const bookId = request.query.book_id;
  db.all(
    `SELECT * FROM reviews WHERE book_id = ? ORDER BY created_at DESC`,
    [bookId],
    (err, reviews) => {
      if (err) {
        console.error('Database error:', err);
        return response.status(500).json({ error: 'Failed to fetch reviews' });
      }
      response.json(reviews);
    }
  );
};