const keys = require('./keys');

// Express App Setup
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Postgres Client Setup
const { Pool } = require('pg');

console.log(' postgres details --- ', keys.pgDatabase, keys.pgHost, keys.pgUser, keys.pgPassword, keys.pgPort, keys)

let pgPoolOptions = {
	user: keys.pgUser,
	host: keys.pgHost,
	database: keys.pgDatabase,
	password: keys.pgPassword,
	port: keys.pgPort
}

let onPgConnection = (conn) => {
	conn
	.query('CREATE TABLE IF NOT EXISTS values (number INT)')
	.catch(err => console.log('pgClient query error ------', err));
}

let connectionAttempt = 0
const maxConnectionAttempts = 4
let pgClient
let handleConnectionFailure = (e, client) => {
	if (client) {
		console.log('got client')
		onPgConnection(pgClient)
		return
	}
	console.log('error while connecting ---- ', e, connectionAttempt, maxConnectionAttempts)
	connectionAttempt++
	if (connectionAttempt > maxConnectionAttempts) {
		return
	}

	setTimeout(() => {
		console.log('attempting to connect ......')
		pgClient.connect(handleConnectionFailure)
	}, 2000)
}

pgClient = new Pool(pgPoolOptions)
pgClient.connect(handleConnectionFailure)

pgClient.on('error', () => console.log('Lost PG connection'));

// Redis Client Setup
const redis = require('redis');
const redisClient = redis.createClient({
  host: keys.redisHost,
  port: keys.redisPort,
  retry_strategy: () => 1000
});
const redisPublisher = redisClient.duplicate();

// Express route handlers

app.get('/', (req, res) => {
  res.send('Hi');
});

app.get('/values/all', async (req, res) => {
  const values = await pgClient.query('SELECT * from values');

  res.send(values.rows);
});

app.get('/values/current', async (req, res) => {
  redisClient.hgetall('values', (err, values) => {
    res.send(values);
  });
});

app.post('/values', async (req, res) => {
  const index = req.body.index;

  if (parseInt(index) > 40) {
    return res.status(422).send('Index too high');
  }

  redisClient.hset('values', index, 'Nothing yet!');
  redisPublisher.publish('insert', index);
  pgClient.query('INSERT INTO values(number) VALUES($1)', [index]);

  res.send({ working: true });
});

app.listen(5000, err => {
  console.log('Listening');
});
