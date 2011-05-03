var http = require('http'),
shorturl = require('shorturl'),
spotify = require('spotify-metadata'),
iTunes = require('itunes').iTunes,
xml2js = require('/usr/local/lib/node/.npm/xml2js/0.1.5/package/lib'),
mongodb = require('mongodb'),
server = new mongodb.Server("127.0.0.1", 61129, {}),
TwBot = require("twbot").TwBot,
bot = new TwBot({"consumerKey":"XXXXXXXXXXXXXXXXXXXXXX",
              "consumerSecret":"XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
              "accessKey"     :"XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
              "accessSecret"  :"XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"}),
link = {},
MicroEvent = require('./microevent.js');

var compareArrays = function(newArray, oldArray) {
	var newestArray = [];
	for (var i in newArray) {
		if (oldArray.indexOf(newArray[i]) == - 1) {
			newestArray.push(newArray[i]);
		}
	}
	return newestArray;
};

var getTop = function(artists, numberOfArtists) {
	var topArtists = [];
	var i = 0;
	while (i < numberOfArtists) {
		topArtists.push(artists[i].title);
		i++;
	}
	return topArtists;
};

var getFeed = function() {

  console.log('gettin the feed');
	var self = this;

	var lastFMRequest = http.get({
		host: "ws.audioscrobbler.com",
		port: 80,
		path: "/1.0/user/" + currentUser.lastfmUsername + "/systemrecs.rss"
	});

	lastFMRequest.addListener('response', function(response) {

		switch (response.statusCode) {

			//no last.fm user by that name
		case 404:
			response.addListener('end', function() {
				bot.client.tweets.update(currentUser.twitterUsername + " uh..what? There isnt a last.fm user called" + currentUser.lastfmUsername + ". checkout http://goo.gl/DmJCA if youre confused");
			});
			break;

		case 200:
			var body = '';
			response.addListener('data', function(chunk) {
				body += chunk;
			});
			response.addListener('end', function() {
				self.trigger('fetched', lastfmFeed = body);
			});
			break;

		default:
			bot.client.tweets.update(currentUser.twitterUsername + " uhoh. something messed up over here. should be fixed soon though. sorry!");
			bot.client.tweets.update("@cleverjake hey man, something fucked up over here. Can you come check it out?");
			var body = '';
			response.addListener('data', function(chunk) {
				body += chunk;
			});
			response.addListener('end', function() {
				console.log(body);
			});
		}
	});
  lastFMRequest.end();
};

MicroEvent.mixin(getFeed);

var parseFeed = function(docs) {

	var getfeed = new getFeed();

	getfeed.bind('fetched', function() {

		var parser = new xml2js.Parser();

		//the user exists in our system before they tweeted 
		if (docs !== undefined) {

			parser.addListener('end', function(result) {
				//top ten last.fm results
        currentUser.numberOfArtists = docs.number_of_artists;
				currentUser.newTop = getTop(result.channel.item.slice(0, docs.number_of_artists), currentUser.numberOfArtists);
				currentUser.oldTop = docs.top_artists;
				currentUser.artistsYetToBeAlerted = docs.artists_yet_to_be_alerted;
				currentUser.newArtistsYetToBeAlerted = compareArrays(currentUser.newTop, currentUser.oldTop);
				currentUser.itunes = docs.itunes;
				currentUser.spotify = docs.spotify;
        currentUser.updateFrequency = docs.how_often;
        if (currentUser.updateFrequency === "hourly"){
          currentUser.nextUpdate = new Date(new Date().getTime() + 3600000).toUTCString();
        }
        if (currentUser.updateFrequency === "daily"){
          currentUser.nextUpdate = new Date(new Date().getTime() + 86400000).toUTCString();
        }
        if (currentUser.updateFrequency === "weekly"){
          currentUser.nextUpdate = new Date(new Date().getTime() + 604800000).toUTCString();
        }
        if (currentUser.updateFrequency === "monthly"){
          currentUser.nextUpdate = new Date(new Date().getTime() + 2629743830).toUTCString();
        }

	new mongodb.Db('tweetlast', server, {}).open(function(error, client) {
		if (error) console.log(error);

		var collection = new mongodb.Collection(client, 'users');

				collection.find({
					lastfm_username: currentUser.lastfmUsername,
          twitter_username: currentUser.twitterUsername
				},
				function(err, cursor) {
					cursor.toArray(function(err, docs) {
						collection.update({
							lastfm_username: currentUser.lastfmUsername,
              twitter_username: currentUser.twitterUsername
						},
						{
							$set: {
								next_update: currentUser.nextUpdate,
								top_artists: currentUser.newTop
							}
						},
						{
							safe: true
						},
						function(err) {
							if (err) {
								if (err) console.warn(err.message);
							}
						});
						if (currentUser.newArtistsYetToBeAlerted.length > 0) {
							for (var i in currentUser.newArtistsYetToBeAlerted) {
								collection.update({
									lastfm_username: currentUser.lastfmUsername,
									twitter_username: currentUser.twitterUsername
								},
								{
									$addToSet: {
										artists_yet_to_be_alerted: currentUser.newArtistsYetToBeAlerted[i]
									}
								},
								{
									safe: true
								},
								function(err) {
									if (err) {
										if (err) console.warn(err.message);
									}
								});
								currentUser.artistsYetToBeAlerted.push(currentUser.newArtistsYetToBeAlerted[i]);
							}
							sendTheRecommendations();
						}
            else if(currentUser.artistsYetToBeAlerted.length > 0 ) {
              sendTheRecommendations();
            }
					});
				});
});
			});
		}
		//user doesnt exist in our database yet, so lets insert them
		else if (docs === undefined) {
			parser.addListener('end', function(result) {
        currentUser.numberOfArtists = 10;
				currentUser.newTop = getTop(result.channel.item.slice(0, 10), currentUser.numberOfArtists);
				currentUser.artistsYetToBeAlerted = currentUser.newTop;
				currentUser.nextUpdate = new Date(new Date().getTime() + (result.channel.ttl * 1000)).toUTCString();
        currentUser.itunes = true;
        currentUser.spotify = false;
        currentUser.updateFrequency = "daily";

          new mongodb.Db('tweetlast', server, {}).open(function(error, client) {
            if (error) console.log(error);

            var collection = new mongodb.Collection(client, 'users');
                collection.insert({
                  lastfm_username: currentUser.lastfmUsername,
                  twitter_username: currentUser.twitterUsername,
                  next_update: currentUser.nextUpdate,
                  how_often: "daily",
                  top_artists: currentUser.newTop,
                  artists_yet_to_be_alerted: currentUser.newTop,
                  itunes: true,
                  spotify: false,
                  number_of_artists: 10
                },
                {
                  safe: true
                },
                function(err, objects) {
                  if (err) console.warn(err.message);
                  bot.client.tweets.update(currentUser.twitterUsername + " welcome aboard! checkout http://goo.gl/DmJCA for all of the options you have. stay tuned for your first recommendation");
                  sendTheRecommendations();
                });
          });
			});
		}
		parser.parseString(lastfmFeed);
	});
};

var updateAccounts = function(userArray) {
	var self = this,
  i = userArray.length;
	new mongodb.Db('tweetlast', server, {}).open(function(error, client) {
    console.log("in the db");
		if (error) throw error;

		var collection = new mongodb.Collection(client, 'users');

    if(i) {
    i--;
    currentUser = userArray.pop();

		collection.find({
			lastfm_username: currentUser.lastfmUsername,
			twitter_username: currentUser.twitterUsername
		},
		function(err, cursor) {
			cursor.toArray(function(err, docs) {
        if (docs.length !== 0){
          var next_update = Date.parse(docs[0].next_update),
          now = new Date().getTime();
          if (next_update - now <= 0) {
            parseFeed(docs[0]);
            updateAccounts(userArray);
          }
          //the ttl for the last update hasnt expired yet.
				}
        else {
          parseFeed();
        }
			});
		});
    };
	});
};

var getLinks = function() {
	var self = this,
	itunesClient = new iTunes(),
	googlKey = 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
	theArtist = currentUser.artistsYetToBeAlerted[0];

	//get links for itunes only
	if (currentUser.itunes === true && currentUser.spotify === false) {
		itunesClient.lookupArtist({
			artist: theArtist
		},
		function(err, artist) {
			if (artist.artistName !== undefined) {
				shorturl(artist.storeUrl, 'goo.gl', {
					key: googlKey
				},
				function(result) {
					link.itunes = result;
					self.trigger('itunes');
				});
			}
			else {
				self.trigger('itunesNone');
			}
		});
	}

	//get links for spotify only
	if (currentUser.spotify === true && currentUser.itunes === false) {
		spotify.searchArtist(theArtist, function(err, artist) {
			if (artist[0] !== undefined) {
				var artistURI = artist[0].href.split(":").pop(),
				href = "http://open.spotify.com/artist/" + artistURI;
				shorturl(href, 'goo.gl', {
					key: googlKey
				},
				function(result) {
					link.spotify = result;
					self.trigger('spotify');
				});
			}
			else {
				self.trigger('spotifyNone');
			}
		});
	}

	//get links for both
	if (currentUser.spotify === true && currentUser.itunes === true) {
		itunesClient.lookupArtist({
			artist: theArtist
		},
		function(err, artist) {
			if (artist.artistName !== undefined) {
				shorturl(artist.storeUrl, 'goo.gl', {
					key: googlKey
				},
				function(result) {
					link.itunes = "itunes: " + result;

					spotify.searchArtist(theArtist, function(err, artist) {
						if (artist[0] !== undefined) {
							var artistURI = artist[0].href.split(":").pop();
							href = "http://open.spotify.com/artist/" + artistURI;
							shorturl(href, 'goo.gl', {
								key: googlKey
							},
							function(result) {
								link.spotify = "spotify: " + result;
								self.trigger('both');
							});
						}
						else {
							self.trigger('bothItunesOnly');
						}
					});
				});
			}
			else {
				spotify.searchArtist(theArtist, function(err, artist) {
					if (artist[0] !== undefined) {
						var artistURI = artist[0].href.split(":").pop();
						href = "http://open.spotify.com/artist/" + artistURI;
						shorturl(href, 'goo.gl', {
							key: googlKey
						},
						function(result) {
							link.spotify = "spotify: " + result;
							self.trigger('bothSpotifyOnly');
						});
					}
					else {
						self.trigger('bothNeither');
					}
				});
			}
		});
	}

	//no links at all
	if (currentUser.spotify === false && currentUser.itunes === false) {
    //FIXME? events arent on self unless the event is "delayed" at some level, even 0 ms.
		setTimeout(function(){self.trigger('neitherLink');}, 0);
	}

};

MicroEvent.mixin(getLinks);

var sendTheRecommendations = function() {

	var getlinks = new getLinks(),
	theArtist = currentUser.artistsYetToBeAlerted[0];

  var itunesApology = '(sorry - iTunes doesnt have them yet. you should request it - http://goo.gl/vAazI)';
  var spotifyApology = '(sorry - spotify isnt cool enough to have a link)';

  var regular = [
   'we think youll be stoked about ' + theArtist + '. ',
   'we have a feeling your going to love ' + theArtist + '. ',
   'check out ' + theArtist + ', it wont kill ya. ',
   'something tells me you want to check out ' + theArtist + '. ',
   'you seem like a cool kid, so ill let you in on a little secret, ' + theArtist + '. ',
   'if you like awesome things, your going to love ' + theArtist + '. ',
   'bored? why dont you let us fix that! check out ' + theArtist + '. ',
   'im telling you - this shit is good. ' + theArtist + '. ',
   'seems like youve got pretty good taste, buddy, make it even better by checking out ' + theArtist + '. ',
   'check out ' + theArtist + ', I promise you wont be disappointed. ',
   'think youve heard it all? think again. check out ' + theArtist + '. ',
   'feeling a bit vanilla? need some spice in your life? then you should check out ' + theArtist + '. ',
   'looking for a good time? listen to ' + theArtist + '. ',
   'we like this and know you will too. ' + theArtist + '. ',
   'since youre neat and ' + theArtist + ' is pretty swell, we think you two should get together. ',
   'theres always extra room a your playlist, so why not add ' + theArtist + ' to yours?',
   theArtist + '. youre welcome. ',
   'I know its not christmas, but I have a gift for you! check out ' + theArtist + '.'
    ];

  var bothNoLinks = [
    'well seems like youre too unique for online music, but we bet you can find something by ' + theArtist + ' at the nearest record store. ',
   'cant find it online, but if youve got time, try finding ' + theArtist + '\'s newest album. ',
   'we cant find it anywhere, but we think ' + theArtist + ' is worth you digging through the internets to hear.'
    ];

    var sendTweet = function(whichTypeOfTweet, extraParams) {
      var randomPick = Math.floor(Math.random() * 20);
      if (whichTypeOfTweet[randomPick] !== undefined) {
          if(extraParams !== undefined) {
            tweet = whichTypeOfTweet[randomPick] +" "+ extraParams;
          }
          else {
            tweet = whichTypeOfTweet[randomPick];
          }
        if ((tweet.length) + (currentUser.twitterUsername.length) < 140) {
          //change to tweet!!!!!!
          bot.client.tweets.update(currentUser.twitterUsername +' '+ tweet);
        }
        else {
          var availableTweetSpace = (139 - (currentUser.twitterUsername.length));
          var tweetArray = tweet.split(' ');
          for (var i in tweetArray){
            var thisWordIndex = (tweet.indexOf(tweetArray[i]) + tweetArray[i].length + currentUser.twitterUsername.length);
            var secondTweetArray = [];
            var inneri = i;
            if (thisWordIndex > availableTweetSpace){
              while (inneri <= tweetArray.length){
                secondTweetArray.push(tweetArray[inneri]);
                inneri++;
              }
              var secondTweet = secondTweetArray.join(' ');
              var firstTweet = tweetArray.slice(0, i);
              //change to tweet!!!!!!
              bot.client.tweets.update(currentUser.twitterUsername +' '+ firstTweet.join(' '));
              bot.client.tweets.update(currentUser.twitterUsername +' '+ secondTweet);
            break;
            }
          }
        }
      }
      else {
       if (extraParams !== undefined){
          sendTweet(whichTypeOfTweet, extraParams);
        }
       else {
          sendTweet(whichTypeOfTweet);
        }
      }
    };


	getlinks.bind('itunes', function() {
    sendTweet(regular, link.itunes);
	});

	getlinks.bind('itunesNone', function() {
    sendTweet(regular, itunesApology);
	});

	getlinks.bind('spotify', function() {
    sendTweet(regular, link.spotify);
	});

	getlinks.bind('spotifyNone', function() {
    sendTweet(regular, spotifyApology);
	});

	getlinks.bind('both', function() {
    sendTweet(regular, link.itunes + ", " + link.spotify);
	});
	getlinks.bind('bothItunesOnly', function() {
    sendTweet(regular, link.itunes + ", " + spotifyApology);
	});
	getlinks.bind('bothSpotifyOnly', function() {
    sendTweet(regular, link.spotify + ", " + itunesApology);
	});
	getlinks.bind('bothNeither', function() {
    sendTweet(bothNoLinks);
	});

	getlinks.bind('neitherLink', function() {
    sendTweet(regular);
	});

	//remove the top artist from mongo
	new mongodb.Db('tweetlast', server, {}).open(function(error, client) {
		if (error) throw error;
		currentUser.artistsYetToBeAlerted.shift();
		var collection = new mongodb.Collection(client, 'users');
		collection.update({
			lastfm_username: currentUser.lastfmUsername,
			twitter_username: currentUser.twitterUsername
		},
		{
			$set: {
				artists_yet_to_be_alerted: currentUser.artistsYetToBeAlerted
			}
		});
	});
};

var checkForReadyUpdates = function() {
  userArray = [];
  console.log('checking for updates');
	new mongodb.Db('tweetlast', server, {}).open(function(error, client) {
		if (error) throw error;
		var collection = new mongodb.Collection(client, 'users');
		collection.find({},
		function(err, cursor) {
			cursor.toArray(function(err, docs) {
      if (err) throw error;
        function addUser(i) {
            if(i) {
              i--;
            var nextUpdate = Date.parse(docs[i].next_update),
            tenMinutesFromNow = new Date().getTime() + 599000;
            //check for users that need to pull info from lastfm
            if (nextUpdate < tenMinutesFromNow) {
              currentUser = {};
              currentUser.twitterUsername = docs[i].twitter_username;
              currentUser.lastfmUsername = docs[i].lastfm_username;
              userArray.push(currentUser);
            }
              addUser(i);
            }
            else {
              updateAccounts(userArray);
            };
        };
      var i = docs.length;
      addUser(i);
			});
		});
	});
};

bot.on('mentioned', function(tweet) {
	var currentUser = {};
	currentUser.twitterUsername = ("@" + tweet.user.screen_name).toLowerCase();
	currentUser.lastfmUsername = tweet.text.split(" ")[1].toLowerCase();

	new mongodb.Db('tweetlast', server, {}).open(function(error, client) {
		if (error) console.log(error);

		var collection = new mongodb.Collection(client, 'users');

				collection.find({
					lastfm_username: currentUser.lastfmUsername,
          twitter_username: currentUser.twitterUsername
				},
				function(err, cursor) {
					cursor.toArray(function(err, docs) {
            if (["itunes","spotify","your",].indexOf(currentUser.lastfmUsername.toLowerCase()) === -1 ||currentUser.lastfmUsername.match(/^\d{1,2}$/)){
              if (docs[0] !== undefined) {
              var theTweet = tweet.text.toLowerCase();

              //get some help
              if (((theTweet.indexOf('@tweetlast help') !== -1) && theTweet.length === 14) ||
                   theTweet.indexOf(' help ') !== -1 ||
                   theTweet.indexOf('@tweetlast '+ currentUser.lastfmUsername  + ' help') !== -1){
                    bot.client.tweets.update(currentUser.twitterUsername + currentUser.twitterUsername + " whats up? checkout http://goo.gl/DmJCA for a list of commands available =]");
              }

              //toggle itunes
              if(theTweet.indexOf(' itunes on') !== -1 && currentUser.lastfmUsername.toLowerCase() !== "itunes") {
                bot.client.tweets.update(currentUser.twitterUsername + ' turned itunes links on');

                  collection.update({
                    lastfm_username: currentUser.lastfmUsername,
                    twitter_username: currentUser.twitterUsername
                  },{$set: {itunes: true}},{safe: true},
                  function(err) {if (err) {if (err) console.warn(err.message);}});
              }
              if(theTweet.indexOf(' itunes off') !== -1 && currentUser.lastfmUsername.toLowerCase() !== "itunes") {
                bot.client.tweets.update(currentUser.twitterUsername + ' turned itunes links off');
                  collection.update({
                    lastfm_username: currentUser.lastfmUsername,
                    twitter_username: currentUser.twitterUsername
                  },{$set: {itunes: false}},{safe: true},
                  function(err) {if (err) {if (err) console.warn(err.message);}});
              }
              //toggle spotify
              if(theTweet.indexOf(' spotify on') !== -1 && currentUser.lastfmUsername.toLowerCase() !== "spotify") {
                  bot.client.tweets.update(currentUser.twitterUsername + ' turned spotify links on');
                  collection.update({
                    lastfm_username: currentUser.lastfmUsername,
                    twitter_username: currentUser.twitterUsername
                  },{$set: {spotify: true}},{safe: true},
                  function(err) {if (err) {if (err) console.warn(err.message);}});
              }
              if(theTweet.indexOf(' spotify off') !== -1 && currentUser.lastfmUsername.toLowerCase() !== "spotify") {
                  bot.client.tweets.update(currentUser.twitterUsername + ' turned spotify links off');
                  collection.update({
                    lastfm_username: currentUser.lastfmUsername,
                    twitter_username: currentUser.twitterUsername
                  },{$set: {spotify: false}},{safe: true},
                  function(err) {if (err) {if (err) console.warn(err.message);}});
              }
              //change how often you are updated
              if (theTweet.split(' ').indexOf('hourly') !== -1) {
                bot.client.tweets.update(currentUser.twitterUsername + ' changed to hourly');
                var newUpdateTime = new Date(new Date().getTime() + 3600000).toUTCString();

                collection.update({
                  lastfm_username: currentUser.lastfmUsername,
                  twitter_username: currentUser.twitterUsername
                },{$set: {how_often: "hourly", next_update: newUpdateTime}},{safe: true},
                function(err) {if (err) {if (err) console.warn(err.message);}});
              }
              else if(theTweet.split(' ').indexOf('daily') !== -1) {
                bot.client.tweets.update(currentUser.twitterUsername + ' changed to daily');
                var newUpdateTime = currentUser.nextUpdate = new Date(new Date().getTime() + 86400000).toUTCString();

                collection.update({
                  lastfm_username: currentUser.lastfmUsername,
                  twitter_username: currentUser.twitterUsername
                },{$set: {how_often: "daily", next_update: newUpdateTime}},{safe: true},
                function(err) {if (err) {if (err) console.warn(err.message);}});

                }
              else if(theTweet.split(' ').indexOf('weekly') !== -1) {
                bot.client.tweets.update(currentUser.twitterUsername + 'changed to weekly');
                var newUpdateTime = currentUser.nextUpdate = new Date(new Date().getTime() + 604800000).toUTCString();

                collection.update({
                  lastfm_username: currentUser.lastfmUsername,
                  twitter_username: currentUser.twitterUsername
                },{$set: {how_often: 'weekly', next_update: newUpdateTime}},{safe: true},
                function(err) {if (err) {if (err) console.warn(err.message);}});

              }
              else if(theTweet.split(' ').indexOf('monthly') !== -1) {
                bot.client.tweets.update(currentUser.twitterUsername + 'changed to monthly');
                var newUpdateTime = currentUser.nextUpdate = new Date(new Date().getTime() + 2629743830).toUTCString();

                collection.update({
                  lastfm_username: currentUser.lastfmUsername,
                  twitter_username: currentUser.twitterUsername
                },{$set: {how_often: 'monthly', next_update: newUpdateTime}},{safe: true},
                function(err) {if (err) {if (err) console.warn(err.message);}});

              }
              //change how many you follow
              if(theTweet.match(/\s\d{1,2}/) !== null) {
                  var numberOfArtists = theTweet.match(/\s\d{1,2}/).pop().split(' ').join('');
                  if(numberOfArtists <= 50) {
                    bot.client.tweets.update(currentUser.twitterUsername + ' now following ' + numberOfArtists + ' artists');

                    collection.update({
                      lastfm_username: currentUser.lastfmUsername,
                      twitter_username: currentUser.twitterUsername
                    },{$set: {number_of_artists: numberOfArtists}},{safe: true},
                    function(err) {if (err) {if (err) console.warn(err.message);}});

                  }
                  else {
                    bot.client.tweets.update(currentUser.twitterUsername + 'sorry, please only use digits, 50 or less');
                  }
              }
              else if (theTweet == "@tweetlast " + currentUser.lastfmUsername){
                console.log(theTweet)
                var next_update = Date.parse(docs[0].next_update),
                now = new Date().getTime();
                bot.client.tweets.update(currentUser.twitterUsername + " whats up? your next update isnt for a bit, so just sit tight. checkout http://goo.gl/DmJCA if youre confused");
          }
            }
          else {
            updateAccounts([currentUser]);
            }
          }
          else {
              bot.client.tweets.update(currentUser.twitterUsername + " hrm, I think you forgot to include your last.fm username...")
            }
});


});
});
});

setInterval(checkForReadyUpdates, 60000);

bot.startUserStream();

