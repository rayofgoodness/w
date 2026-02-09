(function () {
    'use strict';

    var PLUGIN_NAME = 'UAContent';
    var PLUGIN_VERSION = '1.0.0';

    var SOURCE_UASERIALS = {
        name: 'UASerials',
        url: 'https://uaserials.com',
        search: '/index.php?do=search',
        categories: {
            series: '/series/',
            films: '/films/',
            cartoons: '/cartoons/',
            fcartoon: '/fcartoon/',
            anime: '/anime/'
        }
    };

    function startPlugin() {
        if (window[PLUGIN_NAME + '_loaded']) return;
        window[PLUGIN_NAME + '_loaded'] = true;

        Lampa.Lang.add({
            ua_content_title: {
                uk: 'Українське',
                en: 'Ukrainian',
                ru: 'Украинское'
            },
            ua_content_series: {
                uk: 'Серіали',
                en: 'Series',
                ru: 'Сериалы'
            },
            ua_content_films: {
                uk: 'Фільми',
                en: 'Films',
                ru: 'Фильмы'
            },
            ua_content_cartoons: {
                uk: 'Мультсеріали',
                en: 'Cartoons',
                ru: 'Мультсериалы'
            },
            ua_content_search: {
                uk: 'Пошук',
                en: 'Search',
                ru: 'Поиск'
            },
            ua_content_no_results: {
                uk: 'Нічого не знайдено',
                en: 'No results',
                ru: 'Ничего не найдено'
            },
            ua_content_loading: {
                uk: 'Завантаження...',
                en: 'Loading...',
                ru: 'Загрузка...'
            },
            ua_content_season: {
                uk: 'Сезон',
                en: 'Season',
                ru: 'Сезон'
            },
            ua_content_episode: {
                uk: 'Серія',
                en: 'Episode',
                ru: 'Серия'
            },
            ua_content_watch: {
                uk: 'Дивитися',
                en: 'Watch',
                ru: 'Смотреть'
            },
            ua_content_proxy_required: {
                uk: 'Потрібен проксі (Lampac)',
                en: 'Proxy required (Lampac)',
                ru: 'Нужен прокси (Lampac)'
            }
        });

        function getProxyFromLampac() {
            var sources = [
                Lampa.Storage.get('online_mod_proxy_other', ''),
                Lampa.Storage.get('online_mod_proxy_videocdn', ''),
                Lampa.Storage.get('online_mod_proxy_rezka', ''),
                Lampa.Storage.get('online_mod_proxy', ''),
                Lampa.Storage.get('proxy_other', ''),
                Lampa.Storage.get('proxy', '')
            ];

            for (var i = 0; i < sources.length; i++) {
                if (sources[i]) return sources[i];
            }

            if (window.lampac_proxy) return window.lampac_proxy;
            if (window.proxyUrl) return window.proxyUrl;

            var scripts = document.querySelectorAll('script[src*="lampac"], script[src*=":9118"]');
            for (var j = 0; j < scripts.length; j++) {
                var src = scripts[j].src;
                var match = src.match(/(https?:\/\/[^\/]+)/);
                if (match) {
                    return match[1] + '/proxy/';
                }
            }

            var manifest = Lampa.Manifest ? Lampa.Manifest.plugins : [];
            for (var k = 0; k < manifest.length; k++) {
                var plugin = manifest[k];
                if (plugin.url && plugin.url.indexOf(':9118') !== -1) {
                    var baseMatch = plugin.url.match(/(https?:\/\/[^\/]+)/);
                    if (baseMatch) {
                        return baseMatch[1] + '/proxy/';
                    }
                }
            }

            return '';
        }

        function proxyUrl(url) {
            var proxy = getProxyFromLampac();
            
            if (!proxy) {
                console.warn('[UA Content] Проксі не знайдено. Встановіть Lampac або налаштуйте проксі.');
                return url;
            }
            
            if (proxy.indexOf('{url}') !== -1) {
                return proxy.replace('{url}', encodeURIComponent(url));
            }
            
            if (proxy.endsWith('/')) {
                return proxy + encodeURIComponent(url);
            }
            
            return proxy + '/' + encodeURIComponent(url);
        }

        function request(url, callback, errorCallback) {
            var network = new Lampa.Reguest();
            network.timeout(15000);

            var finalUrl = proxyUrl(url);

            network.native(finalUrl, function (response) {
                if (typeof response === 'string') {
                    callback(response);
                } else {
                    callback(response);
                }
            }, function (error) {
                if (errorCallback) errorCallback(error);
            }, false, {
                dataType: 'text'
            });

            return network;
        }

        function parseHTML(html) {
            var parser = new DOMParser();
            return parser.parseFromString(html, 'text/html');
        }

        function parseList(html) {
            var doc = parseHTML(html);
            var items = [];
            
            doc.querySelectorAll('.short-img, .movie-item, [class*="poster"]').forEach(function (el) {
                var link = el.querySelector('a') || el.closest('a');
                var img = el.querySelector('img');
                var title = el.querySelector('.short-title, .movie-title, h3, h4');
                var info = el.querySelector('.short-info, .movie-info, .info');
                
                if (link && img) {
                    var href = link.getAttribute('href') || '';
                    var src = img.getAttribute('src') || img.getAttribute('data-src') || '';
                    var titleText = title ? title.textContent.trim() : '';
                    var infoText = info ? info.textContent.trim() : '';
                    
                    if (!titleText) {
                        titleText = img.getAttribute('alt') || img.getAttribute('title') || '';
                    }

                    if (href && titleText) {
                        items.push({
                            url: href.startsWith('http') ? href : SOURCE_UASERIALS.url + href,
                            poster: src.startsWith('http') ? src : SOURCE_UASERIALS.url + src,
                            title: titleText,
                            info: infoText
                        });
                    }
                }
            });

            if (items.length === 0) {
                doc.querySelectorAll('a[href*=".html"]').forEach(function (link) {
                    var img = link.querySelector('img');
                    if (img) {
                        var href = link.getAttribute('href') || '';
                        var src = img.getAttribute('src') || img.getAttribute('data-src') || '';
                        var titleText = img.getAttribute('alt') || img.getAttribute('title') || '';
                        
                        var parent = link.closest('div, li, article');
                        var titleEl = parent ? parent.querySelector('h2, h3, h4, .title') : null;
                        if (titleEl) titleText = titleEl.textContent.trim();
                        
                        if (href && titleText && href.match(/\/\d+-/)) {
                            items.push({
                                url: href.startsWith('http') ? href : SOURCE_UASERIALS.url + href,
                                poster: src.startsWith('http') ? src : SOURCE_UASERIALS.url + src,
                                title: titleText,
                                info: ''
                            });
                        }
                    }
                });
            }

            return items;
        }

        function parseDetails(html, url) {
            var doc = parseHTML(html);
            var details = {
                title: '',
                original_title: '',
                poster: '',
                description: '',
                year: '',
                genres: [],
                country: '',
                director: '',
                actors: [],
                rating: '',
                seasons: [],
                iframe: ''
            };

            var titleEl = doc.querySelector('h1, .full-title, .movie-title');
            if (titleEl) details.title = titleEl.textContent.trim();

            var origEl = doc.querySelector('.orig-title, .original-title, h2');
            if (origEl) details.original_title = origEl.textContent.trim();

            var posterEl = doc.querySelector('.full-poster img, .poster img, [class*="poster"] img');
            if (posterEl) {
                details.poster = posterEl.getAttribute('src') || posterEl.getAttribute('data-src') || '';
                if (details.poster && !details.poster.startsWith('http')) {
                    details.poster = SOURCE_UASERIALS.url + details.poster;
                }
            }

            var descEl = doc.querySelector('.full-text, .description, [class*="desc"]');
            if (descEl) details.description = descEl.textContent.trim();

            var iframe = doc.querySelector('iframe[src*="ashdi"], iframe[src*="tortuga"], iframe[data-src]');
            if (iframe) {
                details.iframe = iframe.getAttribute('src') || iframe.getAttribute('data-src') || '';
            }

            var scriptTags = doc.querySelectorAll('script');
            scriptTags.forEach(function (script) {
                var text = script.textContent || '';
                
                var playerMatch = text.match(/file\s*[:=]\s*['"](https?:\/\/[^'"]+)['"]/);
                if (playerMatch) {
                    details.file = playerMatch[1];
                }
                
                var playlistMatch = text.match(/playlist\s*[:=]\s*(\[[\s\S]*?\])/);
                if (playlistMatch) {
                    try {
                        details.playlist = JSON.parse(playlistMatch[1]);
                    } catch (e) {}
                }
            });

            return details;
        }

        function Component(object) {
            var network = new Lampa.Reguest();
            var scroll = new Lampa.Scroll({ mask: true, over: true });
            var items = [];
            var html = $('<div class="ua-content"></div>');
            var body = $('<div class="ua-content__body category-full"></div>');
            var active = 0;

            scroll.append(body);
            html.append(scroll.render());

            this.create = function () {
                return this.render();
            };

            this.empty = function (msg) {
                var empty = new Lampa.Empty();
                html.append(empty.render());
                this.start = empty.start;
                this.activity.loader(false);
                this.activity.toggle();
            };

            this.buildItem = function (data) {
                var _this = this;
                
                var card = Lampa.Template.get('card', {
                    title: data.title,
                    release_year: data.info
                });

                var img = card.find('.card__img')[0];
                if (img) {
                    img.onload = function () {
                        card.addClass('card--loaded');
                    };
                    img.onerror = function () {
                        img.src = './img/img_broken.svg';
                    };
                    img.src = data.poster;
                }

                card.on('hover:enter', function () {
                    _this.openDetails(data);
                });

                card.on('hover:focus', function () {
                    active = items.indexOf(card);
                    scroll.update(card, true);
                });

                return card;
            };

            this.openDetails = function (data) {
                var _this = this;
                
                Lampa.Activity.push({
                    url: data.url,
                    title: data.title,
                    component: 'ua_content_details',
                    page: 1,
                    data: data
                });
            };

            this.loadCategory = function (category, page) {
                var _this = this;
                this.activity.loader(true);
                
                page = page || 1;
                var url = SOURCE_UASERIALS.url + SOURCE_UASERIALS.categories[category];
                if (page > 1) url += 'page/' + page + '/';

                request(url, function (html) {
                    _this.activity.loader(false);
                    var results = parseList(html);
                    
                    if (results.length) {
                        _this.buildList(results);
                    } else {
                        _this.empty(Lampa.Lang.translate('ua_content_no_results'));
                    }
                }, function (error) {
                    _this.activity.loader(false);
                    _this.empty(Lampa.Lang.translate('ua_content_proxy_required'));
                });
            };

            this.search = function (query) {
                var _this = this;
                this.activity.loader(true);

                var url = SOURCE_UASERIALS.url + SOURCE_UASERIALS.search;
                var data = 'do=search&subaction=search&story=' + encodeURIComponent(query);

                var network = new Lampa.Reguest();
                network.timeout(15000);

                var finalUrl = proxyUrl(url);

                network.native(finalUrl, function (html) {
                    _this.activity.loader(false);
                    var results = parseList(html);
                    
                    if (results.length) {
                        _this.buildList(results);
                    } else {
                        _this.empty(Lampa.Lang.translate('ua_content_no_results'));
                    }
                }, function (error) {
                    _this.activity.loader(false);
                    _this.empty(Lampa.Lang.translate('ua_content_proxy_required'));
                }, data, {
                    dataType: 'text',
                    method: 'POST'
                });
            };

            this.buildList = function (results) {
                var _this = this;
                body.empty();
                items = [];

                results.forEach(function (data) {
                    var card = _this.buildItem(data);
                    body.append(card);
                    items.push(card);
                });

                this.activity.toggle();
            };

            this.start = function () {
                var _this = this;

                Lampa.Controller.add('content', {
                    toggle: function () {
                        Lampa.Controller.collectionSet(scroll.render());
                        Lampa.Controller.collectionFocus(items[active] || false, scroll.render());
                    },
                    left: function () {
                        if (Lampa.Navigator.canmove('left')) {
                            Lampa.Navigator.move('left');
                        } else {
                            Lampa.Controller.toggle('menu');
                        }
                    },
                    right: function () {
                        Lampa.Navigator.move('right');
                    },
                    up: function () {
                        if (Lampa.Navigator.canmove('up')) {
                            Lampa.Navigator.move('up');
                        } else {
                            Lampa.Controller.toggle('head');
                        }
                    },
                    down: function () {
                        Lampa.Navigator.move('down');
                    },
                    back: function () {
                        Lampa.Activity.backward();
                    }
                });

                Lampa.Controller.toggle('content');

                var category = this.activity.category || 'series';
                var searchQuery = this.activity.search;

                if (searchQuery) {
                    this.search(searchQuery);
                } else {
                    this.loadCategory(category, this.activity.page || 1);
                }
            };

            this.pause = function () {};
            this.stop = function () {};

            this.render = function () {
                return html;
            };

            this.destroy = function () {
                network.clear();
                scroll.destroy();
                html.remove();
                items = [];
            };
        }

        function DetailsComponent(object) {
            var network = new Lampa.Reguest();
            var scroll = new Lampa.Scroll({ mask: true, over: true });
            var html = $('<div class="ua-content-details"></div>');
            var body = $('<div class="ua-content-details__body"></div>');
            var episodes = [];
            var active = 0;

            scroll.append(body);
            html.append(scroll.render());

            this.create = function () {
                return this.render();
            };

            this.empty = function (msg) {
                var empty = new Lampa.Empty();
                html.append(empty.render());
                this.start = empty.start;
                this.activity.loader(false);
                this.activity.toggle();
            };

            this.buildEpisode = function (data, index) {
                var _this = this;
                
                var item = $(`
                    <div class="ua-content-episode selector" data-index="${index}">
                        <div class="ua-content-episode__number">${data.episode || (index + 1)}</div>
                        <div class="ua-content-episode__title">${data.title || 'Серія ' + (index + 1)}</div>
                    </div>
                `);

                item.on('hover:enter', function () {
                    _this.play(data);
                });

                item.on('hover:focus', function () {
                    active = index;
                    scroll.update(item, true);
                });

                return item;
            };

            this.play = function (data) {
                if (data.file) {
                    Lampa.Player.play({
                        title: data.title,
                        url: data.file
                    });
                    Lampa.Player.playlist([{
                        title: data.title,
                        url: data.file
                    }]);
                } else if (data.iframe) {
                    window.open(data.iframe, '_blank');
                }
            };

            this.loadDetails = function (url) {
                var _this = this;
                this.activity.loader(true);

                request(url, function (html) {
                    _this.activity.loader(false);
                    var details = parseDetails(html, url);
                    _this.buildDetails(details);
                }, function (error) {
                    _this.activity.loader(false);
                    _this.empty(Lampa.Lang.translate('ua_content_proxy_required'));
                });
            };

            this.buildDetails = function (details) {
                var _this = this;
                body.empty();
                episodes = [];

                var info = $(`
                    <div class="ua-content-info">
                        <div class="ua-content-info__poster">
                            <img src="${details.poster}" />
                        </div>
                        <div class="ua-content-info__text">
                            <div class="ua-content-info__title">${details.title}</div>
                            <div class="ua-content-info__original">${details.original_title}</div>
                            <div class="ua-content-info__desc">${details.description}</div>
                        </div>
                    </div>
                `);

                body.append(info);

                if (details.playlist && details.playlist.length) {
                    details.playlist.forEach(function (item, index) {
                        var ep = _this.buildEpisode(item, index);
                        body.append(ep);
                        episodes.push(ep);
                    });
                } else if (details.file || details.iframe) {
                    var playBtn = $(`
                        <div class="ua-content-play selector">
                            <span>${Lampa.Lang.translate('ua_content_watch')}</span>
                        </div>
                    `);

                    playBtn.on('hover:enter', function () {
                        _this.play(details);
                    });

                    playBtn.on('hover:focus', function () {
                        scroll.update(playBtn, true);
                    });

                    body.append(playBtn);
                    episodes.push(playBtn);
                }

                this.activity.toggle();
            };

            this.start = function () {
                var _this = this;

                Lampa.Controller.add('content', {
                    toggle: function () {
                        Lampa.Controller.collectionSet(scroll.render());
                        Lampa.Controller.collectionFocus(episodes[active] || false, scroll.render());
                    },
                    left: function () {
                        if (Lampa.Navigator.canmove('left')) {
                            Lampa.Navigator.move('left');
                        } else {
                            Lampa.Controller.toggle('menu');
                        }
                    },
                    right: function () {
                        Lampa.Navigator.move('right');
                    },
                    up: function () {
                        if (Lampa.Navigator.canmove('up')) {
                            Lampa.Navigator.move('up');
                        } else {
                            Lampa.Controller.toggle('head');
                        }
                    },
                    down: function () {
                        Lampa.Navigator.move('down');
                    },
                    back: function () {
                        Lampa.Activity.backward();
                    }
                });

                Lampa.Controller.toggle('content');

                var url = this.activity.url;
                if (url) {
                    this.loadDetails(url);
                } else {
                    this.empty();
                }
            };

            this.pause = function () {};
            this.stop = function () {};

            this.render = function () {
                return html;
            };

            this.destroy = function () {
                network.clear();
                scroll.destroy();
                html.remove();
                episodes = [];
            };
        }

        Lampa.Component.add(PLUGIN_NAME, Component);
        Lampa.Component.add('ua_content_details', DetailsComponent);

        Lampa.Template.add('ua_content_style', `
            <style>
            .ua-content {
                padding: 1.5em;
            }
            .ua-content__body {
                display: flex;
                flex-wrap: wrap;
            }
            .ua-content-details {
                padding: 1.5em;
            }
            .ua-content-info {
                display: flex;
                margin-bottom: 2em;
            }
            .ua-content-info__poster {
                width: 15em;
                flex-shrink: 0;
                margin-right: 2em;
            }
            .ua-content-info__poster img {
                width: 100%;
                border-radius: 0.5em;
            }
            .ua-content-info__title {
                font-size: 2em;
                font-weight: bold;
                margin-bottom: 0.3em;
            }
            .ua-content-info__original {
                opacity: 0.6;
                margin-bottom: 1em;
            }
            .ua-content-info__desc {
                line-height: 1.5;
            }
            .ua-content-episode {
                display: flex;
                align-items: center;
                padding: 1em;
                margin-bottom: 0.5em;
                background: rgba(255,255,255,0.05);
                border-radius: 0.5em;
            }
            .ua-content-episode.focus {
                background: rgba(255,255,255,0.2);
            }
            .ua-content-episode__number {
                width: 3em;
                font-size: 1.2em;
                font-weight: bold;
                opacity: 0.7;
            }
            .ua-content-episode__title {
                flex: 1;
            }
            .ua-content-play {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 1em 2em;
                background: #4285f4;
                border-radius: 0.5em;
                font-size: 1.2em;
                cursor: pointer;
            }
            .ua-content-play.focus {
                background: #5a9bff;
            }
            </style>
        `);

        $('head').append(Lampa.Template.get('ua_content_style', {}, true));

        function addMenuButton() {
            var button = $(`
                <li class="menu__item selector" data-action="${PLUGIN_NAME}">
                    <div class="menu__ico">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none">
                            <rect y="24" width="48" height="24" fill="#FFD700"/>
                            <rect width="48" height="24" fill="#0057B8"/>
                        </svg>
                    </div>
                    <div class="menu__text">${Lampa.Lang.translate('ua_content_title')}</div>
                </li>
            `);

            button.on('hover:enter', function () {
                showCategoryMenu();
            });

            $('.menu .menu__list').eq(0).append(button);
        }

        function showCategoryMenu() {
            var categories = [
                { title: Lampa.Lang.translate('ua_content_series'), category: 'series' },
                { title: Lampa.Lang.translate('ua_content_films'), category: 'films' },
                { title: Lampa.Lang.translate('ua_content_cartoons'), category: 'cartoons' },
                { title: Lampa.Lang.translate('ua_content_search'), category: 'search' }
            ];

            Lampa.Select.show({
                title: Lampa.Lang.translate('ua_content_title'),
                items: categories,
                onSelect: function (item) {
                    if (item.category === 'search') {
                        Lampa.Input.edit({
                            title: Lampa.Lang.translate('ua_content_search'),
                            value: '',
                            free: true
                        }, function (query) {
                            if (query) {
                                Lampa.Activity.push({
                                    url: '',
                                    title: Lampa.Lang.translate('ua_content_search') + ': ' + query,
                                    component: PLUGIN_NAME,
                                    search: query,
                                    page: 1
                                });
                            }
                        });
                    } else {
                        Lampa.Activity.push({
                            url: '',
                            title: item.title,
                            component: PLUGIN_NAME,
                            category: item.category,
                            page: 1
                        });
                    }
                },
                onBack: function () {
                    Lampa.Controller.toggle('menu');
                }
            });
        }

        if (window.appready) {
            addMenuButton();
        } else {
            Lampa.Listener.follow('app', function (e) {
                if (e.type === 'ready') {
                    addMenuButton();
                }
            });
        }
    }

    if (window.Lampa) {
        startPlugin();
    } else {
        var checkInterval = setInterval(function () {
            if (window.Lampa) {
                clearInterval(checkInterval);
                startPlugin();
            }
        }, 100);
    }

})();
