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
      console.log('GPS = ' + JSON.stringify(photo[0].exif.gps));
      var lat = -1;
      var lon = -1;
      if (photo[0].exif.gps && Object.keys(photo[0].exif.gps).length !== 0) {
        var lat = gpsDecimal(
          photo[0].exif.gps.GPSLatitudeRef,  // direction
          photo[0].exif.gps.GPSLatitude[0],  // degrees
          photo[0].exif.gps.GPSLatitude[1],  // minutes
          photo[0].exif.gps.GPSLatitude[2]  // seconds
        );
        var lon = gpsDecimal(
          photo[0].exif.gps.GPSLongitudeRef,
          photo[0].exif.gps.GPSLongitude[0],
          photo[0].exif.gps.GPSLongitude[1],
          photo[0].exif.gps.GPSLongitude[2]
        );
      }
      console.log(lat,lon);      
      res.status(200);
      res.render("details",{rest:photo[0],lat:lat,lon:lon});
    });
  });
});

function findRestaurants(db,criteria,callback) {
	var restaurants = [];
	cursor = db.collection('project').find(criteria); 		
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
	if (queryAsObject.cuisine) new_r['cuisine'] = queryAsObject.cuisine;
	if (queryAsObject.cuisine) new_r['zipcode'] = queryAsObject.zipcode;
	if (queryAsObject.building || queryAsObject.street) {
		var address = {};
		if (queryAsObject.building) address['building'] = queryAsObject.building;
		if (queryAsObject.street) address['street'] = queryAsObject.street;
		new_r['address'] = address;
	}
	var filename = req.files.photo.name;
	var mimetype = req.files.photo.mimetype;

	 var exif = {};
  var image = {};
  image['image'] = filename;

  try {
    new ExifImage(req.files.photo.data, function(error, exifData) {
      if (error) {
        console.log('ExifImage: ' + error.message);
      }
      else {
        exif['image'] = exifData.image;
        exif['exif'] = exifData.exif;
        exif['gps'] = exifData.gps;
        console.log('Exif: ' + JSON.stringify(exif));
      }
    })
	} catch (error) {}
	
	console.log('About to insert: ' + JSON.stringify(new_r));
	MongoClient.connect(mongourl,function(err,db) {
		assert.equal(err,null);
		console.log('Connected to MongoDB\n');
		new_r['mimetype']=mimetype;
		new_r['image'] = req.files.photo.data.toString('base64');
		new_r['exif'] = exif;
		insertRestaurant(db,new_r,function(result) {
			db.close();
			console.log(JSON.stringify(result));
			res.writeHead(200, {"Content-Type": "text/plain"});
			res.end("\ninsert was successful!");			
		});
	});
}

function gpsDecimal(direction,degrees,minutes,seconds) {
  var d = degrees + minutes / 60 + seconds / (60 * 60);
  return (direction === 'S' || direction === 'W') ? d *= -1 : d;
}

app.listen(process.env.PORT || 8099);
