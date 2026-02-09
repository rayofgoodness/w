# CLAUDE.md - Lampa UA Plugin

## Що це

Плагін для медіаплеєра **Lampa** (Android TV), який показує фільми та серіали з українських сайтів:
- uaserials.com
- uakino.best (TODO)

## Поточний стан

Є базовий плагін `q.js` на Raspberry Pi який:
- Показує меню "Українське" з прапором 🇺🇦
- Має категорії: Серіали, Фільми, Мультсеріали
- Парсить uaserials.com через простий Node.js проксі
- **Проблема**: безкінечний лоадер (запити не проходять стабільно)

## Мета

Створити повноцінний backend сервер який:
1. Проксує запити до сайтів (обхід CORS)
2. Парсить HTML та кешує результати в PostgreSQL
3. Віддає готовий JSON для плагіна
4. Автоматично запускається через Docker

## Архітектура

```
lampa-ua/
├── docker-compose.yml
├── server/
│   ├── package.json
│   ├── Dockerfile
│   ├── knexfile.js
│   ├── index.js              # Express сервер
│   ├── db/
│   │   ├── knex.js           # Підключення до БД
│   │   └── migrations/
│   │       └── 001_initial.js
│   ├── routes/
│   │   ├── catalog.js        # GET /api/catalog/:source/:category
│   │   ├── item.js           # GET /api/item/:source/:id
│   │   ├── search.js         # GET /api/search
│   │   └── proxy.js          # GET /proxy?url=
│   └── services/
│       ├── parser.js         # Парсинг HTML (cheerio)
│       └── cache.js          # Робота з кешем
└── plugin/
    └── ua-content.js         # Плагін для Lampa
```

## Технічний стек

- **Runtime**: Node.js 20
- **Framework**: Express.js
- **Database**: PostgreSQL 15
- **ORM**: Knex.js (НЕ Drizzle!)
- **Parser**: cheerio
- **HTTP**: axios
- **Deploy**: Docker Compose на Raspberry Pi

## Raspberry Pi

- **IP**: 192.168.0.195
- **User**: pi
- **Робоча папка**: ~/plugin (поточна), ~/lampa-ua (нова)

### Поточні сервіси:
```bash
# Статичні файли (плагін)
python3 -m http.server 8080

# Простий проксі
node proxy.js  # порт 8081
```

### Нові порти:
- 3000 - API сервер
- 5432 - PostgreSQL

## База даних

### Таблиці:

```sql
-- Кешовані сторінки
cached_pages (
  id SERIAL PRIMARY KEY,
  url VARCHAR(500) UNIQUE NOT NULL,
  content JSONB,
  source VARCHAR(50),
  category VARCHAR(50),
  parsed_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
)

-- Контент
items (
  id SERIAL PRIMARY KEY,
  external_id VARCHAR(100),
  source VARCHAR(50) NOT NULL,
  url VARCHAR(500) NOT NULL,
  title VARCHAR(255) NOT NULL,
  original_title VARCHAR(255),
  poster VARCHAR(500),
  description TEXT,
  year INTEGER,
  type VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(source, external_id)
)

-- Сезони
seasons (
  id SERIAL PRIMARY KEY,
  item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
  season_number INTEGER NOT NULL,
  title VARCHAR(255)
)

-- Епізоди
episodes (
  id SERIAL PRIMARY KEY,
  season_id INTEGER REFERENCES seasons(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,
  title VARCHAR(255),
  video_url VARCHAR(500),
  iframe_url VARCHAR(500)
)
```

## API Endpoints

```
GET  /health                        # Health check
GET  /api/catalog/:source/:category # Список (серіали, фільми...)
GET  /api/item/:source/:id          # Деталі одного item
GET  /api/search?q=&source=         # Пошук
GET  /proxy?url=                    # CORS проксі
POST /api/refresh                   # Оновити кеш
GET  /plugin/ua-content.js          # Плагін (статика)
```

## Парсинг UASerials

### URL структура:
- Серіали: `https://uaserials.com/series/`
- Фільми: `https://uaserials.com/films/`
- Мультсеріали: `https://uaserials.com/cartoons/`
- Сторінка: `https://uaserials.com/11520-ekstraordynarna.html`

### HTML структура списку:
```html
<a href="/11520-ekstraordynarna.html">
  <img src="/posters/11520.jpg" alt="Екстраординарна">
</a>
```

### Regex для URL: `/\/\d+-[\w-]+\.html/`

### Парсинг деталей:
- Назва: `h1`
- Постер: `.poster img` або `img[src*="posters"]`
- Опис: `.full-text` або `.description`
- Плеєр: `iframe[src*="ashdi"]` або `iframe[data-src]`

## Плагін Lampa

### Ключові моменти:

```javascript
// Реєстрація компонента
Lampa.Component.add('UAContent', Component);

// Структура Component
function Component(object) {
    var comp = this;  // ВАЖЛИВО: зберігати this
    
    this.create = function() { return this.render(); };
    this.start = function() { /* завантаження даних */ };
    this.render = function() { return html; };
    this.destroy = function() { /* cleanup */ };
    this.pause = function() {};
    this.stop = function() {};
}

// Завантаження даних
var network = new Lampa.Reguest();
network.silent(url, successCallback, errorCallback);

// Відображення картки
var card = Lampa.Template.get('card', { title: 'Назва' });
card.find('.card__img').attr('src', posterUrl);

// Навігація
Lampa.Activity.push({
    title: 'Title',
    component: 'ComponentName',
    // custom props
});

// Контролер для пульта
Lampa.Controller.add('content', {
    toggle: function() {},
    left: function() { Lampa.Controller.toggle('menu'); },
    right: function() {},
    up: function() { Lampa.Controller.toggle('head'); },
    down: function() {},
    back: function() { Lampa.Activity.backward(); }
});
```

### Часті помилки:
- `this.emit is not a function` - неправильний контекст this
- Безкінечний лоадер - запит не завершився або не викликано `activity.toggle()`

## Команди

```bash
# Розробка локально
cd lampa-ua
docker-compose up -d db
cd server && npm install && npm run dev

# Деплой на Pi
scp -r lampa-ua pi@192.168.0.195:~/
ssh pi@192.168.0.195
cd ~/lampa-ua && docker-compose up -d

# Логи
docker-compose logs -f server

# Міграції
cd server && npm run migrate

# Тест API
curl http://localhost:3000/health
curl http://localhost:3000/api/catalog/uaserials/series
```

## TODO

1. [ ] Створити `server/index.js` - Express app
2. [ ] Створити міграцію `001_initial.js`
3. [ ] Створити `services/parser.js` - парсинг cheerio
4. [ ] Створити `services/cache.js` - кешування
5. [ ] Створити роути: catalog, item, search, proxy
6. [ ] Оновити плагін для нового API
7. [ ] Тестувати на Pi
8. [ ] Додати парсинг відео URL (ashdi.vip)
9. [ ] Додати uakino.best

## Налаштування Lampa на ТВ

1. Налаштування → Розширення → Додати плагін
2. URL: `http://192.168.0.195:3000/plugin/ua-content.js`
3. Перезапустити Lampa
4. В меню з'явиться "Українське" 🇺🇦
