(function() {
  'use strict';

  var API_URL = 'http://192.168.0.195:3001';
  var SOURCE = 'uaserials';

  var CATEGORIES = [
    { id: 'series', title: 'Серіали' },
    { id: 'films', title: 'Фільми' },
    { id: 'cartoons', title: 'Мультфільми' },
    { id: 'anime', title: 'Аніме' }
  ];

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function log(msg) {
    console.log('[UA Plugin] ' + msg);
    fetch(API_URL + '/log?msg=' + encodeURIComponent(msg)).catch(function(){});
  }

  // Storage for series tracking
  var STORAGE_KEY = 'ua_plugin_series_data';

  function getStoredSeriesData() {
    try {
      var data = Lampa.Storage.get(STORAGE_KEY, '{}');
      return typeof data === 'string' ? JSON.parse(data) : data;
    } catch(e) {
      return {};
    }
  }

  function saveSeriesData(itemId, seasonsData) {
    try {
      var allData = getStoredSeriesData();
      var totalEpisodes = 0;
      var seasonCount = seasonsData.length;

      seasonsData.forEach(function(season) {
        totalEpisodes += (season.episodes ? season.episodes.length : 0);
      });

      allData[itemId] = {
        seasons: seasonCount,
        episodes: totalEpisodes,
        lastCheck: Date.now(),
        seasonDetails: seasonsData.map(function(s) {
          return { number: s.number, episodes: s.episodes ? s.episodes.length : 0 };
        })
      };

      Lampa.Storage.set(STORAGE_KEY, JSON.stringify(allData));
      log('Saved series data for ' + itemId + ': ' + seasonCount + ' seasons, ' + totalEpisodes + ' episodes');
    } catch(e) {
      log('Error saving series data: ' + e.message);
    }
  }

  function getStoredSeries(itemId) {
    var allData = getStoredSeriesData();
    return allData[itemId] || null;
  }

  function checkForNewEpisodes(itemId, newSeasonsData) {
    var stored = getStoredSeries(itemId);
    if (!stored) return null;

    var newTotalEpisodes = 0;
    var newSeasonCount = newSeasonsData.length;

    newSeasonsData.forEach(function(season) {
      newTotalEpisodes += (season.episodes ? season.episodes.length : 0);
    });

    var diff = {
      hasNew: false,
      newSeasons: newSeasonCount - stored.seasons,
      newEpisodes: newTotalEpisodes - stored.episodes,
      details: []
    };

    if (diff.newSeasons > 0 || diff.newEpisodes > 0) {
      diff.hasNew = true;

      // Find which seasons have new episodes
      newSeasonsData.forEach(function(newSeason) {
        var oldSeason = null;
        if (stored.seasonDetails) {
          stored.seasonDetails.forEach(function(s) {
            if (s.number === newSeason.number) oldSeason = s;
          });
        }

        var newEpCount = newSeason.episodes ? newSeason.episodes.length : 0;
        var oldEpCount = oldSeason ? oldSeason.episodes : 0;

        if (!oldSeason) {
          diff.details.push('Новий сезон ' + newSeason.number + ' (' + newEpCount + ' серій)');
        } else if (newEpCount > oldEpCount) {
          diff.details.push('Сезон ' + newSeason.number + ': +' + (newEpCount - oldEpCount) + ' серій');
        }
      });
    }

    return diff;
  }

  log('Script loaded');

  function startPlugin() {
    log('startPlugin called');

    var button = $('<li class="menu__item selector" data-action="ua">' +
      '<div class="menu__ico">' +
        '<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">' +
          '<rect y="0" width="36" height="18" fill="#0057B8"/>' +
          '<rect y="18" width="36" height="18" fill="#FFD700"/>' +
        '</svg>' +
      '</div>' +
      '<div class="menu__text">Українське</div>' +
    '</li>');

    button.on('hover:enter', function() {
      log('Menu button clicked');
      try {
        Lampa.Activity.push({
          title: 'Українське',
          component: 'ua_main',
          page: 1
        });
      } catch(e) {
        log('Error in Activity.push: ' + e.message);
      }
    });

    var menuList = $('.menu__list').first();
    if (menuList.length) {
      menuList.append(button);
      log('Menu button added');
    } else {
      log('ERROR: .menu__list not found!');
    }
  }

  // Main component - category list
  function UaMain(object) {
    log('UaMain constructor called');

    var comp = this;
    var scroll;
    var html;
    var body;

    this.create = function() {
      log('UaMain.create called');

      html = $('<div class="ua-main"></div>');
      body = $('<div class="ua-main__body"></div>');
      scroll = new Lampa.Scroll({ mask: true, over: true });

      // Search button
      var searchBtn = $('<div class="ua-main__item selector" tabindex="0"></div>');
      searchBtn.text('🔍 Пошук');

      searchBtn.on('hover:focus', function() {
        scroll.update(searchBtn, true);
      });

      searchBtn.on('hover:enter', function() {
        Lampa.Input.edit({
          title: 'Пошук',
          value: '',
          free: true
        }, function(query) {
          if (query && query.trim()) {
            log('Search query: ' + query);
            Lampa.Activity.push({
              title: 'Пошук: ' + query,
              component: 'ua_search',
              query: query.trim(),
              page: 1
            });
          }
        });
      });

      body.append(searchBtn);

      CATEGORIES.forEach(function(cat) {
        var item = $('<div class="ua-main__item selector" tabindex="0"></div>');
        item.text(cat.title);
        item.data('category', cat.id);

        item.on('hover:focus', function() {
          scroll.update(item, true);
        });

        item.on('hover:enter', function() {
          log('Category enter: ' + cat.title);
          Lampa.Activity.push({
            title: cat.title,
            component: 'ua_catalog',
            category: cat.id,
            page: 1
          });
        });

        body.append(item);
      });

      scroll.append(body);
      html.append(scroll.render(true));

      return html;
    };

    this.start = function() {
      log('UaMain.start called');

      if (this.activity && this.activity.loader) {
        this.activity.loader(false);
      }

      Lampa.Controller.add('content', {
        toggle: function() {
          Lampa.Controller.collectionSet(html);
          Lampa.Controller.collectionFocus(body.find('.selector').first(), html);
        },
        left: function() {
          Lampa.Controller.toggle('menu');
        },
        right: function() {},
        up: function() {
          if (Navigator.canmove('up')) Navigator.move('up');
          else Lampa.Controller.toggle('head');
        },
        down: function() {
          Navigator.move('down');
        },
        back: function() {
          Lampa.Activity.backward();
        }
      });

      Lampa.Controller.toggle('content');
    };

    this.pause = function() {};
    this.stop = function() {};
    this.render = function() { return html; };
    this.destroy = function() {
      if (scroll) scroll.destroy();
      if (html) html.remove();
    };
  }

  // Catalog component
  function UaCatalog(object) {
    log('UaCatalog constructor, category: ' + object.category);

    var comp = this;
    var network = new Lampa.Reguest();
    var html;
    var body;
    var scroll;
    var currentPage = object.page || 1;
    var loading = false;
    var loadMoreBtn = null;

    this.create = function() {
      log('UaCatalog.create');

      html = $('<div class="ua-catalog"></div>');
      body = $('<div class="ua-catalog__body"></div>');
      scroll = new Lampa.Scroll({mask: true, over: true});
      scroll.append(body);
      html.append(scroll.render(true));

      return html;
    };

    function appendCards(results) {
      results.forEach(function(item) {
        var card = Lampa.Template.get('card', {
          title: item.title,
          release_year: item.year || ''
        });

        card.addClass('selector');

        var itemId = item.id.split(':')[1];

        // Check if we have stored data for this series (watched before)
        var storedData = getStoredSeries(itemId);
        if (storedData) {
          card.addClass('ua-watched');
          var watchedBadge = $('<div class="ua-card-badge ua-card-watched" title="Переглядали раніше">👁</div>');
          card.find('.card__view').append(watchedBadge);

          // Show episode count
          var infoText = storedData.seasons + ' сез. / ' + storedData.episodes + ' сер.';
          var infoBadge = $('<div class="ua-card-info"></div>').text(infoText);
          card.find('.card__view').append(infoBadge);
        }

        var img = card.find('.card__img')[0];
        if (item.poster) {
          img.onload = function() {
            card.addClass('card--loaded');
          };
          img.src = API_URL + '/proxy?url=' + encodeURIComponent(item.poster);
        }

        card.on('hover:focus', function() {
          scroll.update(card, true);
        });

        card.on('hover:enter', function() {
          log('Card enter: ' + item.title);
          Lampa.Activity.push({
            title: item.title,
            component: 'ua_item',
            source: SOURCE,
            item_id: itemId,
            poster: item.poster
          });
        });

        if (loadMoreBtn) {
          loadMoreBtn.before(card);
        } else {
          body.append(card);
        }
      });
    }

    function updateLoadMoreBtn(hasMore) {
      if (loadMoreBtn) {
        loadMoreBtn.remove();
        loadMoreBtn = null;
      }

      if (hasMore) {
        loadMoreBtn = $('<div class="selector ua-load-more" tabindex="0"></div>');
        loadMoreBtn.text('Завантажити ще');

        loadMoreBtn.on('hover:focus', function() {
          scroll.update(loadMoreBtn, true);
        });

        loadMoreBtn.on('hover:enter', function() {
          if (loading) return;
          loadPage(currentPage + 1);
        });

        body.append(loadMoreBtn);
      }
    }

    function loadPage(page) {
      loading = true;
      if (loadMoreBtn) loadMoreBtn.text('Завантаження...');

      var url = API_URL + '/api/catalog/' + SOURCE + '/' + object.category + '?page=' + page;
      log('Fetching page ' + page + ': ' + url);

      network.silent(url, function(data) {
        loading = false;
        currentPage = page;

        log('Page ' + page + ' received, items: ' + (data.results ? data.results.length : 0));

        if (comp.activity && comp.activity.loader) {
          comp.activity.loader(false);
        }

        if (data.results && data.results.length) {
          appendCards(data.results);
          updateLoadMoreBtn(data.has_more);
        } else if (page === 1) {
          body.append($('<div class="ua-no-content"></div>').text('Нічого не знайдено'));
        } else {
          updateLoadMoreBtn(false);
        }

        Lampa.Controller.collectionSet(html);

        if (page === 1) {
          Lampa.Controller.add('content', {
            toggle: function() {
              Lampa.Controller.collectionSet(html);
              Lampa.Controller.collectionFocus(body.find('.selector').first(), html);
            },
            left: function() {
              if (Navigator.canmove('left')) Navigator.move('left');
              else Lampa.Controller.toggle('menu');
            },
            right: function() { Navigator.move('right'); },
            up: function() {
              if (Navigator.canmove('up')) Navigator.move('up');
              else Lampa.Controller.toggle('head');
            },
            down: function() { Navigator.move('down'); },
            back: function() { Lampa.Activity.backward(); }
          });

          Lampa.Controller.toggle('content');
        }

      }, function(err) {
        loading = false;
        log('ERROR loading catalog page ' + page + ': ' + (err.message || err.responseText || 'unknown'));
        if (comp.activity && comp.activity.loader) {
          comp.activity.loader(false);
        }
        if (loadMoreBtn) loadMoreBtn.text('Завантажити ще');
        Lampa.Noty.show('Помилка завантаження');
      });
    }

    this.start = function() {
      log('UaCatalog.start');

      if (this.activity && this.activity.loader) {
        this.activity.loader(true);
      }

      loadPage(currentPage);
    };

    this.pause = function() {};
    this.stop = function() {};
    this.render = function() { return html; };
    this.destroy = function() {
      network.clear();
      if (scroll) scroll.destroy();
      if (html) html.remove();
    };
  }

  // Item component
  function UaItem(object) {
    log('UaItem constructor, id: ' + object.item_id);

    var comp = this;
    var network = new Lampa.Reguest();
    var scroll;
    var html;
    var body;
    var itemData;
    var seasonsData = [];

    this.create = function() {
      log('UaItem.create');

      html = $('<div class="ua-item"></div>');
      scroll = new Lampa.Scroll({ mask: true, over: true });
      body = $('<div class="ua-item__body"></div>');

      scroll.append(body);
      html.append(scroll.render(true));

      return html;
    };

    this.start = function() {
      log('UaItem.start');

      if (this.activity && this.activity.loader) {
        this.activity.loader(true);
      }

      var url = API_URL + '/api/item/' + object.source + '/' + object.item_id;
      log('Fetching item: ' + url);

      network.silent(url, function(data) {
        log('Item data received: ' + data.title);
        itemData = data;

        if (comp.activity && comp.activity.loader) {
          comp.activity.loader(false);
        }

        // Header with poster and info
        var header = $('<div class="ua-item-header"></div>');

        if (data.poster) {
          var posterUrl = API_URL + '/proxy?url=' + encodeURIComponent(data.poster);
          header.append('<img class="ua-item-poster" src="' + escapeHtml(posterUrl) + '" alt="">');
        }

        var infoBlock = $('<div class="ua-item-info"></div>');
        infoBlock.append($('<div class="ua-item-title"></div>').text(data.title));

        if (data.original_title) {
          infoBlock.append($('<div class="ua-item-original"></div>').text(data.original_title));
        }

        var meta = [];
        if (data.year) meta.push(data.year);
        if (data.vote_average) meta.push('★ ' + data.vote_average);
        if (meta.length) {
          infoBlock.append($('<div class="ua-item-meta"></div>').text(meta.join(' • ')));
        }

        if (data.overview) {
          infoBlock.append($('<div class="ua-item-desc"></div>').text(data.overview));
        }

        header.append(infoBlock);
        body.append(header);

        // Action buttons row
        var actionsRow = $('<div class="ua-actions-row"></div>');

        // Play button
        var playBtn = $('<div class="selector ua-action-btn" tabindex="0" data-action="play"></div>');
        playBtn.html('<span class="ua-action-icon">▶</span><span class="ua-action-text">Дивитись</span>');
        playBtn.on('hover:focus', function() { scroll.update(playBtn, true); });
        playBtn.on('hover:enter', function() {
          // Will be handled after seasons load
          var firstEpisode = body.find('.ua-episode').first();
          if (firstEpisode.length) {
            firstEpisode.trigger('hover:enter');
          } else {
            var movieBtn = body.find('.ua-play-btn');
            if (movieBtn.length) {
              movieBtn.trigger('hover:enter');
            }
          }
        });
        actionsRow.append(playBtn);

        // Bookmark button
        var bookmarkBtn = $('<div class="selector ua-action-btn" tabindex="0" data-action="bookmark"></div>');
        var isBookmarked = Lampa.Favorite && Lampa.Favorite.check && Lampa.Favorite.check({ id: object.item_id });
        bookmarkBtn.html('<span class="ua-action-icon">' + (isBookmarked ? '★' : '☆') + '</span><span class="ua-action-text">Закладки</span>');
        bookmarkBtn.on('hover:focus', function() { scroll.update(bookmarkBtn, true); });
        bookmarkBtn.on('hover:enter', function() {
          var favItem = {
            id: object.item_id,
            title: data.title,
            original_title: data.original_title || '',
            poster: object.poster || data.poster,
            year: data.year,
            vote_average: data.vote_average,
            source: 'ua_plugin'
          };

          if (Lampa.Favorite) {
            if (Lampa.Favorite.check && Lampa.Favorite.check(favItem)) {
              Lampa.Favorite.remove && Lampa.Favorite.remove('book', favItem);
              bookmarkBtn.find('.ua-action-icon').text('☆');
              Lampa.Noty.show('Видалено із закладок');
            } else {
              Lampa.Favorite.add && Lampa.Favorite.add('book', favItem);
              bookmarkBtn.find('.ua-action-icon').text('★');
              Lampa.Noty.show('Додано в закладки');
            }
          }
        });
        actionsRow.append(bookmarkBtn);

        // Like button
        var likeBtn = $('<div class="selector ua-action-btn" tabindex="0" data-action="like"></div>');
        var isLiked = Lampa.Favorite && Lampa.Favorite.check && Lampa.Favorite.check({ id: object.item_id, type: 'like' });
        likeBtn.html('<span class="ua-action-icon">' + (isLiked ? '❤' : '♡') + '</span><span class="ua-action-text">Подобається</span>');
        likeBtn.on('hover:focus', function() { scroll.update(likeBtn, true); });
        likeBtn.on('hover:enter', function() {
          var favItem = {
            id: object.item_id,
            title: data.title,
            original_title: data.original_title || '',
            poster: object.poster || data.poster,
            year: data.year,
            vote_average: data.vote_average,
            source: 'ua_plugin'
          };

          if (Lampa.Favorite) {
            if (Lampa.Favorite.check && Lampa.Favorite.check({ id: object.item_id, type: 'like' })) {
              Lampa.Favorite.remove && Lampa.Favorite.remove('like', favItem);
              likeBtn.find('.ua-action-icon').text('♡');
              Lampa.Noty.show('Видалено з обраного');
            } else {
              Lampa.Favorite.add && Lampa.Favorite.add('like', favItem);
              likeBtn.find('.ua-action-icon').text('❤');
              Lampa.Noty.show('Додано в обране');
            }
          }
        });
        actionsRow.append(likeBtn);

        body.append(actionsRow);

        // Setup controller
        Lampa.Controller.add('content', {
          toggle: function() {
            Lampa.Controller.collectionSet(html);
            Lampa.Controller.collectionFocus(body.find('.selector').first(), html);
          },
          left: function() {
            if (Navigator.canmove('left')) Navigator.move('left');
            else Lampa.Controller.toggle('menu');
          },
          right: function() { Navigator.move('right'); },
          up: function() {
            if (Navigator.canmove('up')) Navigator.move('up');
            else Lampa.Controller.toggle('head');
          },
          down: function() { Navigator.move('down'); },
          back: function() { Lampa.Activity.backward(); }
        });

        // Load seasons from API
        comp.loadSeasons();

      }, function(err) {
        log('ERROR loading item: ' + (err.message || 'unknown'));
        if (comp.activity && comp.activity.loader) {
          comp.activity.loader(false);
        }
        Lampa.Noty.show('Помилка завантаження');
      });
    };

    this.loadSeasons = function() {
      log('Loading seasons...');

      var loadingDiv = $('<div class="ua-loading">Завантаження сезонів...</div>');
      body.append(loadingDiv);

      // Check if we have stored data for this series
      var storedData = getStoredSeries(object.item_id);
      if (storedData) {
        log('Found stored data: ' + storedData.seasons + ' seasons, ' + storedData.episodes + ' episodes');
      }

      var url = API_URL + '/api/episodes/' + object.source + '/' + object.item_id;
      log('Fetching seasons: ' + url);

      network.silent(url, function(data) {
        loadingDiv.remove();

        if (data.seasons && data.seasons.length) {
          seasonsData = data.seasons;
          log('Seasons loaded: ' + seasonsData.length);

          // Check for new episodes
          var diff = checkForNewEpisodes(object.item_id, seasonsData);
          if (diff && diff.hasNew) {
            log('New content found!');
            var message = '';
            if (diff.newSeasons > 0) {
              message = 'Нових сезонів: ' + diff.newSeasons;
            }
            if (diff.newEpisodes > 0) {
              message += (message ? ', ' : '') + 'нових серій: ' + diff.newEpisodes;
            }
            Lampa.Noty.show('🆕 ' + message, false, 5000);

            // Show badge on title
            comp.showNewBadge(diff);
          }

          // Save updated data
          saveSeriesData(object.item_id, seasonsData);

          comp.renderSeasonSelector();
        } else {
          // Movie - single play button
          comp.renderMoviePlayer();
        }
      }, function(err) {
        loadingDiv.remove();
        log('Error loading seasons: ' + (err.message || 'unknown'));
        // Try movie player as fallback
        comp.renderMoviePlayer();
      });
    };

    this.showNewBadge = function(diff) {
      // Add NEW badge to header
      var badge = $('<span class="ua-new-badge">НОВЕ</span>');
      body.find('.ua-item-title').append(badge);

      // Add details tooltip
      if (diff.details && diff.details.length) {
        var detailsDiv = $('<div class="ua-new-details"></div>');
        diff.details.forEach(function(detail) {
          detailsDiv.append($('<div></div>').text(detail));
        });
        body.find('.ua-item-info').append(detailsDiv);
      }
    };

    this.renderMoviePlayer = function() {
      var playBtn = $('<div class="selector ua-play-btn" tabindex="0"></div>');
      playBtn.text('▶ Дивитись');

      playBtn.on('hover:focus', function() {
        scroll.update(playBtn, true);
      });

      playBtn.on('hover:enter', function() {
        log('Play movie clicked');
        Lampa.Noty.show('Завантаження...');

        var videoUrl = API_URL + '/api/episode/' + object.source + '/' + object.item_id + '/1/1';
        network.timeout(120000);
        network.silent(videoUrl, function(videoData) {
          if (videoData.videoUrl) {
            log('Playing movie: ' + videoData.videoUrl);
            Lampa.Player.play({
              title: itemData.title,
              url: videoData.videoUrl
            });
          } else {
            Lampa.Noty.show('Відео не знайдено');
          }
        }, function(err) {
          log('Movie video error: ' + (err.message || 'unknown'));
          Lampa.Noty.show('Помилка завантаження');
        });
      });

      body.append(playBtn);
      Lampa.Controller.toggle('content');
    };

    this.renderSeasonSelector = function() {
      var selectorDiv = $('<div class="ua-season-selector"></div>');
      selectorDiv.append('<div class="ua-section-title">Сезон:</div>');

      var seasonsRow = $('<div class="ua-seasons-row"></div>');

      seasonsData.forEach(function(season, index) {
        var seasonBtn = $('<div class="selector ua-season-btn" tabindex="0"></div>');
        seasonBtn.text(season.title || 'Сезон ' + season.number);
        seasonBtn.data('season', season.number);
        seasonBtn.data('episodes', season.episodes);

        seasonBtn.on('hover:focus', function() {
          scroll.update(seasonBtn, true);
        });

        seasonBtn.on('hover:enter', function() {
          log('Season selected: ' + season.number);
          body.find('.ua-season-btn').removeClass('active');
          seasonBtn.addClass('active');
          comp.showEpisodes(season.number, season.episodes);
        });

        seasonsRow.append(seasonBtn);

        if (index === 0) {
          seasonBtn.addClass('active');
        }
      });

      selectorDiv.append(seasonsRow);
      body.append(selectorDiv);

      // Episodes container
      var episodesContainer = $('<div class="ua-episodes-container"></div>');
      body.append(episodesContainer);

      // Show first season episodes
      if (seasonsData.length > 0) {
        comp.showEpisodes(seasonsData[0].number, seasonsData[0].episodes);
      }

      Lampa.Controller.toggle('content');
    };

    this.showEpisodes = function(seasonNum, episodes) {
      log('showEpisodes: season ' + seasonNum + ', episodes: ' + (episodes ? episodes.length : 0));

      var container = body.find('.ua-episodes-container');
      container.empty();

      if (!episodes || !episodes.length) {
        container.append('<div class="ua-no-content">Серії не знайдено</div>');
        return;
      }

      container.append('<div class="ua-section-title">Серії:</div>');

      var episodesRow = $('<div class="ua-episodes-row"></div>');

      episodes.forEach(function(ep) {
        var epNum = ep.number;
        var epItem = $('<div class="selector ua-episode" tabindex="0"></div>');
        epItem.text(epNum);
        epItem.attr('title', ep.title || 'Серія ' + epNum);
        epItem.data('season', seasonNum);
        epItem.data('episode', epNum);

        epItem.on('hover:focus', function() {
          scroll.update(epItem, true);
        });

        epItem.on('hover:enter', function() {
          log('Episode clicked: S' + seasonNum + 'E' + epNum);
          Lampa.Noty.show('Завантаження S' + seasonNum + 'E' + epNum + '...');
          epItem.addClass('loading');

          var videoUrl = API_URL + '/api/episode/' + object.source + '/' + object.item_id + '/' + seasonNum + '/' + epNum;
          network.timeout(120000);
          network.silent(videoUrl, function(videoData) {
            epItem.removeClass('loading');

            if (videoData.videoUrl) {
              // Show warning if specific episode not available
              if (videoData.warning) {
                Lampa.Noty.show(videoData.warning);
              }
              log('Playing: ' + videoData.videoUrl);
              Lampa.Player.play({
                title: itemData.title + ' - S' + seasonNum + 'E' + epNum,
                url: videoData.videoUrl
              });
            } else {
              Lampa.Noty.show('Серію не знайдено');
            }
          }, function(err) {
            epItem.removeClass('loading');
            log('Video error: ' + (err.message || 'unknown'));
            Lampa.Noty.show('Помилка завантаження');
          });
        });

        episodesRow.append(epItem);
      });

      container.append(episodesRow);

      Lampa.Controller.collectionSet(html);
      Lampa.Controller.collectionFocus(episodesRow.find('.selector').first(), html);
    };

    this.pause = function() {};
    this.stop = function() {};
    this.render = function() { return html; };
    this.destroy = function() {
      network.clear();
      if (scroll) scroll.destroy();
      if (html) html.remove();
    };
  }

  // Search component
  function UaSearch(object) {
    log('UaSearch constructor, query: ' + object.query);

    var comp = this;
    var network = new Lampa.Reguest();
    var html;
    var content;
    var scroll;

    this.create = function() {
      html = $('<div class="ua-catalog"></div>');
      content = $('<div class="ua-catalog__body"></div>');
      scroll = new Lampa.Scroll({mask: true, over: true});
      scroll.append(content);
      html.append(scroll.render(true));
      return html;
    };

    this.start = function() {
      log('UaSearch.start');

      if (this.activity && this.activity.loader) {
        this.activity.loader(true);
      }

      var url = API_URL + '/api/search?q=' + encodeURIComponent(object.query) + '&source=' + SOURCE;
      log('Searching: ' + url);

      network.silent(url, function(data) {
        log('Search results: ' + (data.results ? data.results.length : 0));

        if (comp.activity && comp.activity.loader) {
          comp.activity.loader(false);
        }

        if (data.results && data.results.length) {
          data.results.forEach(function(item) {
            var card = Lampa.Template.get('card', {
              title: item.title,
              release_year: item.year || ''
            });

            card.addClass('selector');

            if (item.poster) {
              var posterUrl = API_URL + '/proxy?url=' + encodeURIComponent(item.poster);
              card.find('.card__img').attr('src', posterUrl);
            }

            card.on('hover:focus', function() {
              scroll.update(card, true);
            });

            card.on('hover:enter', function() {
              Lampa.Activity.push({
                title: item.title,
                component: 'ua_item',
                source: SOURCE,
                item_id: item.id.split(':')[1],
                poster: item.poster
              });
            });

            content.append(card);
          });
        } else {
          content.append('<div class="ua-no-content">Нічого не знайдено</div>');
        }

        Lampa.Controller.add('content', {
          toggle: function() {
            Lampa.Controller.collectionSet(html);
            Lampa.Controller.collectionFocus(content.find('.selector').first(), html);
          },
          left: function() {
            if (Navigator.canmove('left')) Navigator.move('left');
            else Lampa.Controller.toggle('menu');
          },
          right: function() { Navigator.move('right'); },
          up: function() {
            if (Navigator.canmove('up')) Navigator.move('up');
            else Lampa.Controller.toggle('head');
          },
          down: function() { Navigator.move('down'); },
          back: function() { Lampa.Activity.backward(); }
        });

        Lampa.Controller.toggle('content');

      }, function(err) {
        log('Search error: ' + (err.message || 'unknown'));
        if (comp.activity && comp.activity.loader) {
          comp.activity.loader(false);
        }
        Lampa.Noty.show('Помилка пошуку');
      });
    };

    this.pause = function() {};
    this.stop = function() {};
    this.render = function() { return html; };
    this.destroy = function() {
      network.clear();
      if (scroll) scroll.destroy();
      if (html) html.remove();
    };
  }

  // Register components
  log('Registering components...');

  try {
    Lampa.Component.add('ua_main', UaMain);
    log('ua_main registered');
  } catch(e) {
    log('ERROR registering ua_main: ' + e.message);
  }

  try {
    Lampa.Component.add('ua_catalog', UaCatalog);
    log('ua_catalog registered');
  } catch(e) {
    log('ERROR registering ua_catalog: ' + e.message);
  }

  try {
    Lampa.Component.add('ua_item', UaItem);
    log('ua_item registered');
  } catch(e) {
    log('ERROR registering ua_item: ' + e.message);
  }

  try {
    Lampa.Component.add('ua_search', UaSearch);
    log('ua_search registered');
  } catch(e) {
    log('ERROR registering ua_search: ' + e.message);
  }

  // CSS
  var styles = '\
    .ua-main { position: relative; min-height: 100%; }\
    .ua-main .scroll { height: 100%; }\
    .ua-main__body { padding: 1.5em; color: #fff; }\
    .ua-main__item { display: block; padding: 1em 1.5em; margin: 0.5em 0; background: rgba(255,255,255,0.15); border-radius: 0.5em; font-size: 1.3em; color: #fff; }\
    .ua-main__item:first-child { background: rgba(255,215,0,0.3); }\
    .ua-main__item.focus { background: rgba(255,255,255,0.3) !important; }\
    \
    .ua-catalog { position: relative; height: 100%; padding: 2em; }\
    .ua-catalog .scroll { height: 100%; }\
    .ua-catalog__body { display: flex; flex-wrap: wrap; gap: 1em; }\
    .ua-catalog__body .card { width: 12em; }\
    .ua-catalog__body .card.focus { transform: scale(1.05); }\
    \
    .ua-load-more { width: 100%; padding: 1em; margin-top: 1em; text-align: center; background: rgba(255,255,255,0.1); border-radius: 0.5em; font-size: 1.1em; }\
    .ua-load-more.focus { background: rgba(255,215,0,0.4) !important; }\
    \
    .ua-item { position: relative; height: 100%; width: 100%; overflow: hidden; }\
    .ua-item .scroll { height: 100% !important; overflow-y: auto !important; }\
    .ua-item__body { color: #fff; padding: 1.5em; padding-bottom: 3em; }\
    \
    .ua-item-header { display: flex; gap: 1.5em; margin-bottom: 1.5em; }\
    .ua-item-poster { width: 12em; height: auto; border-radius: 0.5em; flex-shrink: 0; }\
    .ua-item-info { flex: 1; }\
    .ua-item-title { font-size: 1.8em; font-weight: bold; margin-bottom: 0.3em; }\
    .ua-item-original { color: rgba(255,255,255,0.6); margin-bottom: 0.5em; }\
    .ua-item-meta { color: #FFD700; margin-bottom: 0.8em; font-size: 1.1em; }\
    .ua-item-desc { line-height: 1.5; color: rgba(255,255,255,0.85); max-width: 50em; }\
    \
    .ua-actions-row { display: flex; gap: 1em; margin: 1.5em 0; flex-wrap: wrap; }\
    .ua-action-btn { display: flex; align-items: center; gap: 0.5em; padding: 0.8em 1.5em; background: rgba(255,255,255,0.1); border-radius: 0.5em; font-size: 1.1em; cursor: pointer; }\
    .ua-action-btn.focus { background: rgba(255,215,0,0.5) !important; transform: scale(1.05); }\
    .ua-action-btn[data-action="play"] { background: rgba(255,215,0,0.3); }\
    .ua-action-icon { font-size: 1.3em; }\
    .ua-action-text { white-space: nowrap; }\
    \
    .ua-play-btn { display: inline-block; padding: 0.8em 2em; margin: 1em 0; background: rgba(255,215,0,0.3); border-radius: 0.5em; font-size: 1.2em; }\
    .ua-play-btn.focus { background: rgba(255,215,0,0.5) !important; }\
    \
    .ua-section-title { color: rgba(255,255,255,0.7); margin-bottom: 0.8em; font-size: 1.1em; }\
    .ua-season-selector { margin: 1.5em 0; }\
    .ua-seasons-row { display: flex; flex-wrap: wrap; gap: 0.5em; }\
    .ua-season-btn { padding: 0.6em 1.2em; background: rgba(255,255,255,0.1); border-radius: 0.4em; }\
    .ua-season-btn.focus { background: rgba(255,215,0,0.5) !important; transform: scale(1.05); }\
    .ua-season-btn.active { background: rgba(255,215,0,0.3); border: 2px solid #FFD700; }\
    \
    .ua-episodes-container { margin-top: 1.5em; }\
    .ua-episodes-row { display: flex; flex-wrap: wrap; gap: 0.5em; }\
    .ua-episode { width: 3em; height: 3em; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.1); border-radius: 0.4em; font-size: 1.1em; }\
    .ua-episode.focus { background: rgba(255,215,0,0.5) !important; transform: scale(1.1); }\
    .ua-episode.loading { background: rgba(255,215,0,0.3); }\
    \
    .ua-loading { color: rgba(255,255,255,0.6); padding: 1em 0; }\
    .ua-no-content { color: rgba(255,255,255,0.5); padding: 1em 0; }\
    \
    .ua-new-badge { display: inline-block; margin-left: 0.5em; padding: 0.2em 0.6em; background: #ff4444; color: #fff; font-size: 0.5em; font-weight: bold; border-radius: 0.3em; vertical-align: middle; animation: ua-pulse 1.5s infinite; }\
    @keyframes ua-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }\
    .ua-new-details { margin-top: 1em; padding: 0.8em; background: rgba(255,68,68,0.2); border-left: 3px solid #ff4444; border-radius: 0.3em; font-size: 0.95em; }\
    .ua-new-details div { padding: 0.2em 0; }\
    \
    .ua-card-badge { position: absolute; top: 0.3em; right: 0.3em; padding: 0.2em 0.4em; border-radius: 0.3em; font-size: 0.8em; z-index: 2; }\
    .ua-card-watched { background: rgba(0,0,0,0.7); }\
    .ua-card-info { position: absolute; bottom: 0; left: 0; right: 0; padding: 0.3em; background: linear-gradient(transparent, rgba(0,0,0,0.9)); font-size: 0.75em; text-align: center; z-index: 2; }\
    .ua-watched .card__img { opacity: 0.8; }\
  ';

  $('head').append('<style>' + styles + '</style>');

  // Start plugin
  function init() {
    log('init() called');
    startPlugin();
  }

  if (window.appready) {
    log('App already ready');
    init();
  } else {
    log('Waiting for app ready...');
    Lampa.Listener.follow('app', function(e) {
      if (e.type === 'ready') {
        init();
      }
    });
  }

  log('Plugin script finished');

})();
