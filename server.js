var express = require('express');
var app = express();
var session = require('cookie-session');
var fileUpload = require('express-fileupload');
var bodyParser = require('body-parser');
var MongoClient = require('mongodb').MongoClient;
var ObjectID = require('mongodb').ObjectID;
var assert = require('assert');
var ExifImage = require('exif').ExifImage;
var fs = require('fs');
var mongourl = 'mongodb://s1141002:159753@ds137054.mlab.com:37054/comps381f';

var SECRETKEY = 'I want to pass COMPS381F';

var users = new Array(
	{name: 'developer', password: 'developer'},
	{name: 'guest', password: 'guest'},
	{name: 'demo', password: ''}
);

// cookie-session middleware
app.use(session({
  name: 'session',
  keys: ['this is secret','don not tell anyone']
}));

app.use(fileUpload());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');

app.get('/login',function(req,res) {
	res.status(200).render("login");
});

app.post('/login',function(req,res) {
	console.log(req.body.name);
	for (var i=0; i<users.length; i++) {
		if (users[i].name == req.body.name &&
		    users[i].password == req.body.password) {
			req.session.authenticated = true;
			req.session.username = users[i].name;
		}
	}
	res.redirect('/');
});

app.get('/logout',function(req,res) {
	req.session = null;
	res.redirect('/');
});

app.get('/',function(req,res) {
	if (!req.session.authenticated) {
		res.redirect('/login');
	} else {
	res.redirect('/read');}
});

app.get("/read", function(req,res) {
	MongoClient.connect(mongourl, function(err, db) {
		assert.equal(err,null);
		console.log('Connected to MongoDB\n');
		findRestaurants(db,{},function(restaurants) {
			db.close();
			console.log(req.session.username);
			res.status(200).render("home", {c: restaurants,username:req.session.username,doclen:restaurants.length});
		});
	});
});

app.get("/new", function(req,res) {
			res.status(200).render("create_new_restaurant");
});

app.get('/edit', function(req,res) {
	MongoClient.connect(mongourl, function(err,db) {
    assert.equal(err,null);
    console.log('Connected to MongoDB');
    var criteria = {};
    criteria['_id'] = ObjectID(req.query._id);
    findPhoto(db,criteria,{},function(photo) {
      db.close();
      console.log('Disconnected MongoDB');
      console.log('Photo returned = ' + photo.length);     
      res.status(200);
      res.render("edit",{rest:photo[0]});
    });
  });
});

app.post("/edit", function(req,res) {
			update(req,res,req.body,ObjectID(req.query._id));
});

app.post("/create", function(req,res) {
			create(req,res,req.body);
});

app.get('/details', function(req,res) {
	MongoClient.connect(mongourl, function(err,db) {
    assert.equal(err,null);
    console.log('Connected to MongoDB');
    var criteria = {};
    criteria['_id'] = ObjectID(req.query._id);
    findPhoto(db,criteria,{},function(photo) {
      db.close();
      console.log('Disconnected MongoDB');
      console.log('Photo returned = ' + photo.length);     
      res.status(200);
      res.render("details",{rest:photo[0]});
    });
  });
});

app.get('/map', function(req,res) {
  res.render('gmap.ejs',
             {lat:req.query.lat,lon:req.query.lon});
});

function findRestaurants(db,criteria,callback) {
	var restaurants = [];
	cursor = db.collection('project').find(criteria,{name:1}); 		
	cursor.each(function(err, doc) {
		assert.equal(err, null); 
		if (doc != null) {
			restaurants.push(doc);
		} else {
			callback(restaurants); 
		}
	});
}

function insertRestaurant(db,r,callback) {
	db.collection('project').insertOne(r,function(err,result) {
		assert.equal(err,null);
		console.log("Insert was successful!");
		callback(result);
	});
}

function deleteRestaurant(db,criteria,callback) {
	db.collection('project').deleteMany(criteria,function(err,result) {
		assert.equal(err,null);
		console.log("Delete was successfully");
		callback(result);
	});
}

function updateRestaurant(db,criteria,newValues,callback) {
	db.collection('project').updateOne(
		criteria,{$set: newValues},function(err,result) {
			assert.equal(err,null);
			console.log("update was successfully");
			callback(result);
	});
}

function findDistinctBorough(db,callback) {
	db.collection('project').distinct("borough", function(err,result) {
		console.log(result);
		callback(result);
	});
}

function findPhoto(db,criteria,fields,callback) {
  var cursor = db.collection("project").find(criteria);
  var photos = [];
  cursor.each(function(err,doc) {
    assert.equal(err,null);
    if (doc != null) {
      photos.push(doc);
    } else {
      callback(photos);
    }
  });
}

function create(req,res,queryAsObject) {
	var new_r = {};	// document to be inserted
	if (queryAsObject.name) new_r['name'] = queryAsObject.name;
	if (queryAsObject.owner) new_r['owner'] = queryAsObject.owner;
	if (queryAsObject.restaurant_id) new_r['restaurant_id'] = queryAsObject.restaurant_id;
	if (queryAsObject.borough) new_r['borough'] = queryAsObject.borough;
	if (queryAsObject.cuisine) new_r['cuisine'] = queryAsObject.cuisine;
	if (queryAsObject.zipcode) new_r['zipcode'] = queryAsObject.zipcode;
	if (queryAsObject.lat) new_r['lat'] = queryAsObject.lat;
	if (queryAsObject.lon) new_r['lon'] = queryAsObject.lon;
	if (queryAsObject.building || queryAsObject.street) {
		var address = {};
		if (queryAsObject.building) address['building'] = queryAsObject.building;
		if (queryAsObject.street) address['street'] = queryAsObject.street;
		new_r['address'] = address;
	}
	new_r['createBy'] = req.session.username;
	if(req.files.photo){
	var filename = req.files.photo.name;
	var mimetype = req.files.photo.mimetype;
  var image = {};
  image['image'] = filename;
	}
	console.log('About to insert: ' + JSON.stringify(new_r));
	MongoClient.connect(mongourl,function(err,db) {
		assert.equal(err,null);
		console.log('Connected to MongoDB\n');
		if(req.files.photo){
		new_r['mimetype']=mimetype;
		new_r['image'] = req.files.photo.data.toString('base64');
		}
		insertRestaurant(db,new_r,function(result) {
			db.close();
			console.log(JSON.stringify(result));
			res.writeHead(200, {"Content-Type": "text/plain"});
			res.end("\ninsert was successful!");			
		});
	});
}

function update(req,res,queryAsObject,targetID) {
	var target = {_id:targetID};
	var new_r = {};	// document to be inserted
	if (queryAsObject.name) new_r['name'] = queryAsObject.name;
	if (queryAsObject.owner) new_r['owner'] = queryAsObject.owner;
	if (queryAsObject.restaurant_id) new_r['restaurant_id'] = queryAsObject.restaurant_id;
	if (queryAsObject.borough) new_r['borough'] = queryAsObject.borough;
	if (queryAsObject.cuisine) new_r['cuisine'] = queryAsObject.cuisine;
	if (queryAsObject.zipcode) new_r['zipcode'] = queryAsObject.zipcode;
	if (queryAsObject.lat) new_r['lat'] = queryAsObject.lat;
	if (queryAsObject.lon) new_r['lon'] = queryAsObject.lon;
	if (queryAsObject.building || queryAsObject.street) {
		var address = {};
		if (queryAsObject.building) address['building'] = queryAsObject.building;
		if (queryAsObject.street) address['street'] = queryAsObject.street;
		new_r['address'] = address;
	}
	new_r['createBy'] = req.session.username;
	if(req.files.photo){
	var filename = req.files.photo.name;
	var mimetype = req.files.photo.mimetype;
  var image = {};
  image['image'] = filename;
	}
	console.log('About to insert: ' + JSON.stringify(new_r));
	MongoClient.connect(mongourl,function(err,db) {
		assert.equal(err,null);
		console.log('Connected to MongoDB\n');
		if(req.files.photo){
		new_r['mimetype']=mimetype;
		new_r['image'] = req.files.photo.data.toString('base64');}
		updateRestaurant(db,target,new_r,function(result) {
			db.close();
			console.log(JSON.stringify(result));
			res.writeHead(200, {"Content-Type": "text/plain"});
			res.end("\nupdate was successful!");			
		});
	});
}

app.listen(process.env.PORT || 8099);
