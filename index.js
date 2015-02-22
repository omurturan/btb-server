var express     = require('express');
var app         = express();
var pg          = require('pg');
var fs          = require('fs');
var bodyParser  = require('body-parser');
var util        = require('util');
var winston     = require('winston');
var squel       = require("squel");

squel.useFlavour('postgres');

app.set('port', 5000);
app.use(express.static(__dirname + '/public'));

app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());


var logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({ 
            json:  false, 
            timestamp: true 
        }),
        new (winston.transports.File)({ 
            name: 'info-file', 
            filename: __dirname + '/logs/info.log',
            level: 'info',
            json: false,
            timestamp: true
        }),
        new (winston.transports.File)({ 
            name: 'access-file', 
            filename: __dirname + '/logs/access.log',
            level: 'debug',
            json: false,
            timestamp: true
        }),
        new (winston.transports.File)({ 
            name: 'error-file', 
            filename: __dirname + '/logs/error.log',
            level: 'error',
            json: false,
            timestamp: true
        })
    ],
    exceptionHandlers: [
        new (winston.transports.Console)({ 
            json: false, 
            timestamp: true 
        }),
        new winston.transports.File({ 
            filename: __dirname + '/logs/exceptions.log', 
            json: false,
            timestamp: true
        })
    ],
    exitOnError: false
});


var IMAGE_DIR = './public/';

var DATABASE_URL = 'postgres://application:application123@localhost:5432/postgres';


app.get('/', function (request, response) {

    fs.readFile(IMAGE_DIR + 'a.jpg', function (err, data) {
        if (err) {
            throw err;
        }

        response.writeHead(200, {'Content-Type': 'image/jpeg', 'imageId' : 4});
        response.end(data);

    });

    logger.log('info', request.headers['user-agent']);
});


app.get('/getNextImage/:userId', function (request, response) {

    logger.log('debug', request.originalUrl);

    //first get the userId parameter
    var userId = 1;

    if (request.params.userId && !isNaN(parseInt(request.params.userId, 10))) {
        userId = parseInt(request.params.userId, 10);
    } else {
        response.status(500);
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({"Error message" : "Invalid user id"}));
        logger.log('error', 'Invalid user id on method ' + request.originalUrl);
        return;
    }

    // kendi upload ettigi resimleri ve daha once
    // oy verdigi resimler gelmesin.
    var getImagesQuery = squel.select({ autoQuoteAliasNames: false })
                            .from("image")
                            .left_join(
                                squel.select()
                                    .field("imageid")
                                    .from("vote")
                                    .where("userid = " + userId),
                                'v',
                                'v.imageid = image.id'
                                )
                            .where("v.imageid IS NULL")
                            .where("image.userid != " + userId);

/*
                        'SELECT image.id, name, submittedon ' +
                        'FROM image ' + 
                        'LEFT JOIN (SELECT vote.imageid FROM vote WHERE vote.userid = ' + userId + ') v ' + 
                        'ON image.id = v.imageid ' + 
                        'WHERE v.imageid IS NULL AND image.userid != ' + userId;*/

    logger.log('info', getImagesQuery.toString());

    pg.connect(DATABASE_URL, function (err, client, done) {


        client.query(getImagesQuery.toString(), function (err, result) {
            done();
            if (err) {
                console.error(err);
                response.setHeader('Content-Type', 'application/json');
                response.end(JSON.stringify({"Error message" : err}));
                logger.log('error', 'Database Error on ' + request.originalUrl);
                logger.log('error', err);
                return;
            }

            var numberOfPictures = result.rows.length;

            if (numberOfPictures === 0) {
                response.setHeader('Content-Type', 'application/json');
                response.end(JSON.stringify({"Error message" : "No image found for this user"}));
                logger.log('error', 'No image found for ' + userId + ' on ' + request.originalUrl);
                return;
            }

            var rand = Math.floor(Math.random() * numberOfPictures);
            var imageName = result.rows[rand].name;
            var imageId = result.rows[rand].id;
            var imageUrl = "http://81.4.102.107:5000/" + imageName;


            response.status(200);
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON
                            .stringify({
                                        "imageId" : imageId,
                                        "imageName" : imageName,
                                        "imageUrl" : imageUrl
                                        }));
            return;
            
        });
    });

});

 
app.get('/getClients', function (request, response) {

    logger.log('debug', request.originalUrl);
    
    pg.connect(DATABASE_URL, function (err, client, done) {

        var queryString = squel.select()
                            .from("client");

        client.query(queryString.toString(), function (err, result) {
            done();
            if (err) {
                console.error(err);
                response.setHeader('Content-Type', 'application/json');
                response.end(JSON.stringify({"Error message" : err}));
                logger.log('error', 'Database Error on ' + request.originalUrl);
                logger.log('error', err);
                return;
            } else {
                response.setHeader('Content-Type', 'application/json');
                response.send(result.rows);
            }
        });
    });

});


app.get('/getLeaderboard', function (request, response ) {

    logger.log('debug', request.originalUrl);
    
    pg.connect(DATABASE_URL, function (err, client, done) {

        var queryString = squel.select({ autoQuoteAliasNames: false })
                                .field('client.id', 'ownerId')
                                .field('client.name', 'ownerName')
                                .field('client.surname', 'ownerSurname')
                                .field('vote.imageid')
                                .field('image.name', 'imagename')
                                .field('count(*)', 'totalVote')
                                .field('count(likeCount.id)', 'likeCount')
                                .field('count(dislikeCount.id)', 'dislikeCount')
                                .field('((count(likeCount.id)/count(*))', 'score')
                            .from('vote')
                            .left_join(
                                squel.select()
                                    .field('id')
                                    .from('vote')
                                    .where('votevalue = 0'),
                                'dislikeCount',
                                'dislikeCount.id = vote.id'
                            )
                            .left_join(
                                squel.select()
                                    .field('id')
                                    .from('vote')
                                    .where('votevalue = 1'),
                                'likeCount',
                                'likeCount.id = vote.id'
                            )
                            .join(
                                'image',
                                null,
                                'image.id = vote.imageid'
                            )
                            .join(
                                'client',
                                null,
                                'client.id = image.userid'
                            )
                            .group('client.id')
                            .group('client.name')
                            .group('client.surname')
                            .group('vote.imageid')
                            .group('image.name')
                            .order('likeCount', false)
                            .limit(5);


        logger.log('debug', queryString.toString());

        client.query(queryString.toString(), function (err, result) {
            done();
            if (err) {
                console.error(err);
                response.setHeader('Content-Type', 'application/json');
                response.end(JSON.stringify({"Error message" : err}));
                logger.log('error', 'Database Error on ' + request.originalUrl);
                logger.log('error', err);
            } else {
                response.setHeader('Content-Type', 'application/json');
                response.send(result.rows);
            }
        });
    });

});


app.post('/vote', function (request, response){

    logger.log('debug', request.originalUrl);

    var userId = -1;
    var imageid = -1;
    var vote = -1;
    var errorMessage = "";

    if (request.body.userId && !isNaN(parseInt(request.body.userId, 10)) ) {
        userId = parseInt(request.body.userId, 10);
    } else {
        errorMessage += "user id ";
    }

    if (request.body.imageId && !isNaN(parseInt(request.body.imageId, 10)) ) {
        imageId = parseInt(request.body.imageId, 10);
    } else {
        errorMessage += "imageId ";
    }

    if (request.body.vote && !isNaN(parseInt(request.body.vote, 10)) ) {
        vote = parseInt(request.body.vote, 10);
    } else {
        errorMessage += "vote value";
    }


    if (userId == -1 || imageId == -1 || vote == -1) {
        response.status(400);
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({"Error message" : "Invalid input value " + errorMessage}));
        logger.log('error', 'Invalid ' + errorMessage + ' on ' + request.originalUrl);
        return;
    }


    pg.connect(DATABASE_URL, function (err, client, done) {

            var insertVoteQuery = squel.insert()
                                    .into('vote')
                                    .set('userid', userId)
                                    .set('imageid', imageId)
                                    .set('votevalue', vote);

/*
                'INSERT INTO '+
                    'vote (userid, imageid, votevalue) ' + 
                    'VALUES (' + userId +', ' + imageId + ', ' + vote + ')';*/

            logger.log('info', insertVoteQuery.toString());

            client.query(insertVoteQuery.toString(), function (error, result) {
                done();
                if (error) {
                    console.error(error);
                    response.status(400);
                    response.setHeader('Content-Type', 'application/json');
                    response.end(JSON.stringify({"Error message" : error}));
                    logger.log('error', 'Database Error on ' + request.originalUrl);
                    logger.log('error', error);
                    return;
                } else {
                    response.status(200);
                    response.setHeader('Content-Type', 'application/json');
                    response.end(JSON.stringify({"message" : "Vote saved"}));
                    return;
                }
            });
        });

});


app.post('/uploadImage', function (request, response) {

    logger.log('debug', request.originalUrl);

    // first get the user id
    var body = request.body;
    
    var userId = -1;
    var imageEncodedString = "";
        
    if (body.userId && !isNaN(parseInt(body.userId, 10)) ) {
        userId = body.userId;
    } else {
        response.status(400);
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({"Error message" : "Invalid userId"}));
        logger.log('error', 'Invalid user id on method ' + request.originalUrl);
        return;
    }

    if (body.encodedImage) {
        imageEncodedString = body.encodedImage;
    } else {
        response.status(400);
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({"Error message" : "No image"}));
        logger.log('error', 'Invalid image on method ' + request.originalUrl);
        return;
    }

    var fileName = userId + "_" + Date.now() + ".jpeg";


    try {
        var base64Image = imageEncodedString.toString('base64');
        var decodedImage = new Buffer(base64Image, 'base64');
        fs.writeFileSync('' + IMAGE_DIR + fileName, decodedImage);

        pg.connect(DATABASE_URL, function (err, client, done) {

            var insertImageQuery = squel.insert()
                                    .into('image')
                                    .set('userid', userId)
                                    .set('name', fileName);
/*

                'INSERT INTO ' + 
                    'image (userid, name) ' + 
                    'VALUES (' + userId +', \'' + fileName + '\')';*/

            logger.log('info', insertImageQuery.toString());

            client.query(insertImageQuery.toString(), function (error, result) {
                done();
                if (error) {
                    console.error(error);
                    response.status(400);
                    response.setHeader('Content-Type', 'application/json');
                    response.end(JSON.stringify({"Error message" : error}));
                    logger.log('error', 'Database Error on ' + request.originalUrl);
                    logger.log('error', error);
                    return;
                } else {
                    response.status(200);
                    response.setHeader('Content-Type', 'application/json');
                    response.end(JSON.stringify({"message" : "Image saved"}));
                    logger.log('info', 'Image write success ' + fileName);
                    return;
                }
            });
        });

    } catch (ex) {
        //deal with it!!
        response.status(400);
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({"error" : "Image could not be written on disk"}));
        logger.log('error', "Image not saved " + fileName);
        return;
    }

});


app.post('/signUp', function (request, response) {

    logger.log('debug', request.originalUrl);

    //first check if the parameters are all set

    var facebookId, name, surname, gender, email;

    var query = request.query;
    var body = request.body;
    logger.log('debug', body);

    if (body.facebookId && body.name && body.surname) {

        facebookId = body.facebookId;
        name = body.name;
        surname = body.surname;
        gender = body.gender;
        email = body.email;

    } else {
        response.status(412);
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ 'Error message': 'Eksik parametre' }, null, 3));
        logger.log('error', 'Invalid parameters on method ' + request.originalUrl);
        return;
    }

    //if all parameters are ok, then make a connection to database
    pg.connect(DATABASE_URL, function (err, client, done) {

        var checkUserExistQuery = squel.select()
                                        .from('client')
                                        .where('id = ' + facebookId);
        logger.log('info', checkUserExistQuery.toString());


        /*
        first check if the a user with the same facebookid is registered.
        if not, register the user.
        if there is, then do nothing for now

        TODO: if there is already a user, then login
        */
        client.query(checkUserExistQuery.toString(), function (err, result) {
            done();
            if (err) {
                console.error(err);
                response.status(500);
                response.setHeader('Content-Type', 'application/json');
                response.end(JSON.stringify({"Error message" : err}));
                logger.log('error', 'Database Error on ' + request.originalUrl);
                logger.log('error', err);
                return;

            } else {

                if (result.rows.length === 0) { //good. user can sign up
                    
                    var insertNewUserQuery = squel.insert()
                                                .into('client')
                                                .set('id', facebookId)
                                                .set('name', name)
                                                .set('surname', surname)
                                                //.set('gender', gender)
                                                .set('email', email)
                                                .returning('id');

                    if (email) {
                        insertNewUserQuery.set('email', email);
                    };

                    logger.log('info', insertNewUserQuery.toString());

                    client.query(insertNewUserQuery.toString(), function (error, resulta) {
                        done();
                        if (error) {
                            console.error(error);
                            response.status(400);
                            response.setHeader('Content-Type', 'application/json');
                            response.end(JSON.stringify({"Error message" : error}));
                            logger.log('error', 'Database Error on ' + request.originalUrl);
                            logger.log('error', error);
                            return;

                        } else { //successfully inserted
                            response.status(200);
                            response.setHeader('Content-Type', 'application/json');
                            response.end(JSON.stringify({"userId" : resulta.rows[0].id}));
                            return;
                        }
                    });

                } else { //another user with the same facebookid, return his id
                    response.status(200);
                    response.setHeader('Content-Type', 'application/json');
                    response.end(JSON.stringify({"userId" : result.rows[0].id}));
                    return;
                }

            }
        });
    });

});


app.listen(app.get('port'), function () {
    logger.log('info', "Node app is running at localhost:" + app.get('port'));
});
