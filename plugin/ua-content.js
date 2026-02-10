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
    // Also send to server for debugging
    fetch(API_URL + '/log?msg=' + encodeURIComponent(msg)).catch(function(){});
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
      log('Menu button clicked - hover:enter');
      try {
        Lampa.Activity.push({
          title: 'Українське',
          component: 'ua_main',
          page: 1
        });
        log('Activity.push called successfully');
      } catch(e) {
        log('Error in Activity.push: ' + e.message);
      }
    });

    var menuList = $('.menu__list').first();
    if (menuList.length) {
      menuList.append(button);
      log('Menu button added to .menu__list');
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
    var initialized = false;

    this.create = function() {
      log('UaMain.create called');

      html = $('<div class="ua-main"></div>');
      body = $('<div class="ua-main__body" style="padding: 1.5em;"></div>');
      scroll = new Lampa.Scroll({ mask: true, over: true });

      CATEGORIES.forEach(function(cat, index) {
        log('Creating category button: ' + cat.title);

        var item = $('<div class="ua-main__item selector" tabindex="0" style="padding: 1em 1.5em; margin: 0.5em 0; background: rgba(255,255,255,0.1); border-radius: 0.5em; font-size: 1.3em;"></div>');
        item.text(cat.title);
        item.data('category', cat.id);

        item.on('hover:focus', function() {
          log('Category focus: ' + cat.title);
          scroll.update(item, true);
        });

        item.on('hover:enter', function() {
          log('Category enter: ' + cat.title + ' (id: ' + cat.id + ')');
          try {
            Lampa.Activity.push({
              title: cat.title,
              component: 'ua_catalog',
              category: cat.id,
              page: 1
            });
            log('Catalog Activity.push success');
          } catch(e) {
            log('Error pushing catalog: ' + e.message);
          }
        });

        body.append(item);
      });

      scroll.append(body);
      html.append(scroll.render(true));

      initialized = true;
      log('UaMain.create finished, html ready');

      return html;
    };

    this.start = function() {
      log('UaMain.start called');

      if (this.activity && this.activity.loader) {
        this.activity.loader(false);
      }

      Lampa.Controller.add('content', {
        toggle: function() {
          log('UaMain controller toggle');
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
      log('UaMain.start finished');
    };

    this.pause = function() { log('UaMain.pause'); };
    this.stop = function() { log('UaMain.stop'); };
    this.render = function() {
      log('UaMain.render called');
      return html;
    };

    this.destroy = function() {
      log('UaMain.destroy');
      if (scroll) scroll.destroy();
      if (html) html.remove();
    };
  }

  // Catalog component
  function UaCatalog(object) {
    log('UaCatalog constructor, category: ' + object.category);

    var comp = this;
    var network = new Lampa.Reguest();
    var scroll;
    var html;
    var body;

    this.create = function() {
      log('UaCatalog.create');

      html = $('<div class="category-full"></div>');
      body = $('<div class="category-full__content" style="display:flex;flex-wrap:wrap;padding:1.5em;gap:1.5em;"></div>');
      scroll = new Lampa.Scroll({ mask: true, over: true });

      scroll.append(body);
      html.append(scroll.render(true));

      return html;
    };

    this.start = function() {
      log('UaCatalog.start, loading data...');

      var currentPage = object.page || 1;
      var loading = false;
      var loadMoreBtn = null;

      if (this.activity && this.activity.loader) {
        this.activity.loader(true);
      }

      function appendCards(results) {
        results.forEach(function(item) {
          var card = Lampa.Template.get('card', {
            title: item.title,
            release_year: item.year || ''
          });

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
              item_id: item.id.split(':')[1],
              poster: item.poster
            });
          });

          // Вставляємо перед кнопкою "Завантажити ще", якщо вона є
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
          loadMoreBtn = $('<div class="selector ua-load-more" tabindex="0" style="width:100%;padding:1em;margin-top:1em;text-align:center;background:rgba(255,255,255,0.1);border-radius:0.5em;cursor:pointer;font-size:1.1em;"></div>');
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
            body.append($('<div style="padding:2em;color:rgba(255,255,255,0.5);"></div>').text('Нічого не знайдено'));
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

          log('UaCatalog page ' + page + ' render complete');

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
    var episodesLoaded = false;

    this.create = function() {
      log('UaItem.create');

      html = $('<div class="ua-item"></div>');
      body = $('<div class="ua-item__body" style="padding:1.5em;"></div>');
      scroll = new Lampa.Scroll({ mask: true, over: true });

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

        body.append($('<div style="font-size:2em;font-weight:bold;margin-bottom:0.5em;"></div>').text(data.title));

        if (data.original_title) {
          body.append($('<div style="color:rgba(255,255,255,0.6);margin-bottom:0.5em;"></div>').text(data.original_title));
        }

        // Info section
        var info = [];
        if (data.year) info.push('Рік: ' + data.year);
        if (data.vote_average) info.push('Рейтинг: ' + data.vote_average);
        if (info.length) {
          body.append($('<div style="color:rgba(255,255,255,0.7);margin-bottom:1em;"></div>').text(info.join(' | ')));
        }

        if (data.overview) {
          body.append($('<div style="line-height:1.5;margin-bottom:1.5em;max-width:60em;"></div>').text(data.overview));
        }

        // Render seasons selector
        comp.renderSeasonSelector();

        Lampa.Controller.add('content', {
          toggle: function() {
            Lampa.Controller.collectionSet(html);
            Lampa.Controller.collectionFocus(body.find('.selector').first(), html);
          },
          left: function() {
            if (Navigator.canmove('left')) Navigator.move('left');
            else Lampa.Controller.toggle('menu');
          },
          right: function() {
            Navigator.move('right');
          },
          up: function() {
            if (Navigator.canmove('up')) Navigator.move('up');
            else Lampa.Controller.toggle('head');
          },
          down: function() { Navigator.move('down'); },
          back: function() { Lampa.Activity.backward(); }
        });

        Lampa.Controller.toggle('content');

      }, function(err) {
        log('ERROR loading item: ' + (err.message || 'unknown'));
        if (comp.activity && comp.activity.loader) {
          comp.activity.loader(false);
        }
        Lampa.Noty.show('Помилка завантаження');
      });
    };

    this.renderSeasonSelector = function() {
      if (!itemData.seasons || !itemData.seasons.length) {
        // Фільм — одна кнопка "Дивитись"
        var playBtn = $('<div class="selector" tabindex="0" style="display:inline-block;padding:0.8em 2em;margin:1em 0;background:rgba(255,215,0,0.3);border-radius:0.5em;font-size:1.2em;cursor:pointer;"></div>');
        playBtn.text('Дивитись');

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
        body.append($('<div class="ua-episodes-container" style="margin-top:1em;"></div>'));
        return;
      }

      // Серіал — список сезонів з API
      var selectorDiv = $('<div class="ua-season-selector" style="margin:1em 0;"></div>');
      selectorDiv.append($('<div style="color:rgba(255,255,255,0.7);margin-bottom:0.5em;"></div>').text('Оберіть сезон:'));

      itemData.seasons.forEach(function(season) {
        var seasonBtn = $('<div class="selector ua-season-btn" tabindex="0" style="display:block;padding:0.7em 1.2em;margin:0.3em 0;background:rgba(255,255,255,0.1);border-radius:0.3em;width:fit-content;cursor:pointer;"></div>');
        seasonBtn.text(season.name || 'Сезон ' + season.season_number);

        seasonBtn.on('hover:focus', function() {
          log('Season focus: ' + (season.name || season.season_number));
          scroll.update(seasonBtn, true);
        });

        seasonBtn.on('hover:enter', function() {
          log('Season selected: ' + (season.name || season.season_number));
          body.find('.ua-season-btn').css('background', 'rgba(255,255,255,0.1)');
          seasonBtn.css('background', 'rgba(255,215,0,0.4)');
          comp.showEpisodes(season);
        });

        selectorDiv.append(seasonBtn);
      });

      body.append(selectorDiv);

      // Episodes container
      body.append($('<div class="ua-episodes-container" style="margin-top:1em;"></div>'));
    };

    this.showEpisodes = function(season) {
      log('showEpisodes called for season: ' + (season.name || season.season_number));

      var container = body.find('.ua-episodes-container');
      container.empty();

      var header = $('<div style="color:#FFD700;font-size:1.2em;margin-bottom:0.5em;"></div>');
      header.text('Серії — ' + (season.name || 'Сезон ' + season.season_number) + ':');
      container.append(header);

      if (!season.episodes || !season.episodes.length) {
        container.append($('<div style="padding:1em;color:rgba(255,255,255,0.5);"></div>').text('Серії не знайдено'));
        return;
      }

      season.episodes.forEach(function(ep) {
        var epItem = $('<div class="selector ua-episode" tabindex="0" style="display:block;padding:0.6em 1em;margin:0.3em 0;background:rgba(255,255,255,0.1);border-radius:0.3em;width:fit-content;cursor:pointer;"></div>');
        epItem.text(ep.name || 'Серія ' + ep.episode_number);

        epItem.on('hover:focus', function() {
          log('Episode focus: S' + season.season_number + 'E' + ep.episode_number);
          scroll.update(epItem, true);
        });

        epItem.on('hover:enter', function() {
          log('Episode clicked: S' + season.season_number + 'E' + ep.episode_number);
          Lampa.Noty.show('Завантаження S' + season.season_number + 'E' + ep.episode_number + '...');
          epItem.css('background', 'rgba(255,215,0,0.3)');

          if (ep.video_url) {
            log('Playing: ' + ep.video_url);
            epItem.css('background', 'rgba(255,255,255,0.1)');
            Lampa.Player.play({
              title: itemData.title + ' - S' + season.season_number + 'E' + ep.episode_number,
              url: ep.video_url
            });
          } else {
            var videoUrl = API_URL + '/api/episode/' + object.source + '/' + object.item_id + '/' + season.season_number + '/' + ep.episode_number;
            network.timeout(120000);
            network.silent(videoUrl, function(videoData) {
              epItem.css('background', 'rgba(255,255,255,0.1)');

              if (videoData.videoUrl) {
                log('Playing: ' + videoData.videoUrl);
                Lampa.Player.play({
                  title: itemData.title + ' - S' + season.season_number + 'E' + ep.episode_number,
                  url: videoData.videoUrl
                });
              } else {
                Lampa.Noty.show('Серію не знайдено');
              }
            }, function(err) {
              epItem.css('background', 'rgba(255,255,255,0.1)');
              log('Video error: ' + (err.message || 'unknown'));
              Lampa.Noty.show('Помилка завантаження');
            });
          }
        });

        container.append(epItem);
      });

      // Update collection and focus first episode
      log('Updating collection and focusing first episode');
      Lampa.Controller.collectionSet(html);
      Lampa.Controller.collectionFocus(container.find('.selector').first(), html);
    };

    this.renderSeasons = function(seasons) {
      // Legacy function - not used anymore
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

  // CSS
  $('head').append('<style>\
    .ua-main__item.focus, .ua-item .selector.focus { background: rgba(255,255,255,0.3) !important; }\
    .ua-episode.focus, .ua-season-btn.focus, .ua-load-more.focus { background: rgba(255,215,0,0.4) !important; }\
    .category-full__content { gap: 1.5em; height: 100%; overflow-y: auto; }\
    .category-full__content .card { margin: 0.2em !important; }\
    .ua-item, .ua-main, .category-full { position: absolute; top: 0; left: 0; right: 0; bottom: 0; }\
    .ua-item .scroll, .ua-main .scroll, .category-full .scroll { height: 100%; }\
    .ua-item .scroll__content, .ua-main .scroll__content, .category-full .scroll__content { height: 100%; overflow-y: auto; }\
  </style>');

  // Start plugin
  function init() {
    log('init() called, window.appready=' + window.appready);
    startPlugin();
  }

  if (window.appready) {
    log('App already ready, starting immediately');
    init();
  } else {
    log('Waiting for app ready event...');
    Lampa.Listener.follow('app', function(e) {
      log('App event: ' + e.type);
      if (e.type === 'ready') {
        init();
      }
    });
  }

  log('Plugin script finished');

})();
