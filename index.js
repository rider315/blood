require('dotenv').config();
var debug = require('debug')('http');
var morgan = require('morgan');
var express = require('express');
var bodyParser = require('body-parser');
var path = require('path');
var cookieParser = require('cookie-parser');
var app = express();
var mongoose = require('mongoose');
var userModel = require('./models/user');

// Load environment variables
const dburi = process.env.DBURI;

// Helper function to escape regular expressions
const escapeRegExp = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
};

// Middleware setup
app.use(morgan('dev'));
app.use(cookieParser()); // No KEY used here
app.use(express.static('public/js'));
app.use(express.static('public/css'));
app.use(express.static('public/img'));
app.use(express.static('public/json'));
app.set('view engine', 'ejs');
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

// Connect to MongoDB
mongoose.connect(
  dburi,
  { useNewUrlParser: true, useUnifiedTopology: true, useCreateIndex: true },
  (err) => {
    if (err) throw err;
    console.log('Connected to MongoDB');
  }
);

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/register.html'));
});

app.post('/register', (req, res) => {
  debug(req.body);
  userModel
    .findOne({ phone: req.body.phone })
    .then((user) => {
      if (user == null) {
        new userModel({
          name: req.body.name.toUpperCase(),
          bloodGroup: req.body.blood.toUpperCase() + req.body.rh,
          city: req.body.city.toUpperCase(),
          phone: req.body.phone,
          amount: req.body.amount || 0,
          address: req.body.address,
        })
          .save()
          .then((user) => {
            res.cookie('user', user.phone, { maxAge: 2 * 24 * 60 * 60 * 1000 });
            res.redirect('/donate');
          })
          .catch((err) => {
            res.send(err.message + '\nPlease go back and try again.');
          });
      } else {
        res.cookie('user', user.phone, { maxAge: 2 * 24 * 60 * 60 * 1000 });
        res.redirect('/donate');
      }
    })
    .catch((err) => {
      res.send(err.message);
    });
});

app.post('/donate', (req, res) => {
  if (req.body.amount == undefined || req.body.amount <= 0) {
    res.redirect('back');
    return;
  }
  userModel.findOne({ phone: req.cookies.user }, function (err, user) {
    if (err) res.send(err);
    if (!user) {
      res.redirect('/logout');
      console.error('Unexpected issue: User not found.');
      return;
    }
    user.amount += parseFloat(req.body.amount);
    user
      .save({
        validateBeforeSave: true,
      })
      .then(() => res.redirect('/donate'))
      .catch((err) => {
        res.send(err.message);
      });
  });
});

app.get('/donate', (req, res) => {
  debug(req.cookies.user);
  if (req.cookies.user) {
    userModel
      .findOne({ phone: req.cookies.user })
      .then((user) => {
        if (user == null) {
          console.error('Unexpected issue: User not found.');
          res.redirect('/logout');
        } else {
          res.render('donate', {
            user: {
              name: user.name,
              amount: user.amount,
              lastDonated:
                user.createdAt - user.updatedAt === 0
                  ? 'Never.'
                  : user.updatedAt,
            },
          });
        }
      })
      .catch((err) => {
        console.error(err);
        res.send(err.message);
      });
  } else {
    res.redirect('/register');
  }
});

app.get('/bank', (req, res) => {
  if (!req.cookies.user) {
    res.redirect('/register');
    return;
  }

  if (!req.query.blood) req.query.blood = '(A|B|O|AB)';

  if (req.query.rh) req.query.blood += escapeRegExp(req.query.rh);
  else req.query.blood += '[\\+-]';

  if (!req.query.city) req.query.city = '';

  var page = req.query.page;
  if (!page || page < 1) page = 1;

  var query = {
    $and: [
      { bloodGroup: { $regex: req.query.blood, $options: 'i' } },
      { city: { $regex: req.query.city, $options: 'i' } },
    ],
  };

  userModel.find(
    query,
    null,
    {
      sort: { amount: -1 },
      limit: 18,
      skip: (page - 1) * 18,
    },
    function (err, docs) {
      if (err) res.send(err);
      res.render('bank', { docs: docs, logged: req.cookies.user });
    }
  );
});

app.get('/logout', (req, res) => {
  res.clearCookie('user');
  res.redirect('/');
});

// Start the server
var port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log('App listening on port ' + port + '!');
});
