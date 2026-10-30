
(() => {
  'use strict';

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const money = n => Number(n).toLocaleString('ru-RU') + ' ₽';

  const prices = {
    animation: ['Мультипликация', 2000, 2000],
    realism: ['Кинематографичный реализм', 5000, 5000],
    hybrid: ['Реальное видео + AI', 4000, 7000],
    edit: ['Монтаж готового видео', null, null]
  };

  const s = {
    mode: 'video',
    style: 'animation',
    count: 15,
    tg: false,
    vk: false,
    posts: 10,
    packageCost: 50000,
    promo: 'promo'
  };

  const site = {
    kind: 'simple',
    design: 'standard',
    catalog: false,
    motion: false,
    forms: false,
    calculator: false,
    bot: false,
    copy: false
  };

  const radio = (name, value, label, selected) =>
    `<label class="choice">
      <input type="radio" name="${name}" value="${value}"
        ${selected ? 'checked' : ''}>
      <span>${label}</span>
    </label>`;

  const check = (name, label, selected) =>
    `<label class="checkline">
      <input type="checkbox" name="${name}"
        ${selected ? 'checked' : ''}>
      <span>${label}</span>
    </label>`;

  const channelCount = () =>
    (s.mode === 'video' || s.mode === 'promo')
      ? 0
      : Number(s.tg) + Number(s.vk);

  function calculation() {
    const p = prices[s.style];
    const channels = channelCount();
    return {
      min: p[1] === null ? null :
        s.count * p[1] + 15000 * channels,
      max: p[2] === null ? null :
        s.count * p[2] + 15000 * channels,
      once: s.mode === 'full' ? s.packageCost : 0,
      channels
    };
  }

  function renderCalculator(root) {
    if (!root) return;

    const { min, max, once, channels } = calculation();
    const promoMode = s.mode === 'promo';

    const total = min === null
      ? 'Индивидуальный расчёт'
      : min === max
        ? money(min)
        : `${money(min)} – ${money(max)}`;

    root.innerHTML = `
      <div class="calc-layout">
        <div>
          <h3 class="calc-title">Соберите свой пакет</h3>
          <p class="calc-subtitle">
            Выбирайте услуги и смотрите предварительную стоимость.
          </p>

          <fieldset class="calc-group">
            <legend>01 / Формат сотрудничества</legend>
            <div class="choice-grid">
              ${radio('mode','video',
                'Пакет готовых видео',s.mode==='video')}
              ${radio('mode','content',
                'Видео + контент для каналов',
                s.mode==='content')}
              ${radio('mode','full',
                'Полное продвижение под ключ',
                s.mode==='full')}
              ${radio('mode','promo',
                'Отдельный авторский проект',promoMode)}
            </div>
          </fieldset>

          ${promoMode ? `
            <fieldset class="calc-group">
              <legend>Вид проекта</legend>
              <div class="choice-grid">
                ${radio('promo','promo',
                  'Промо-ролик · от 20 000 ₽',
                  s.promo==='promo')}
                ${radio('promo','series',
                  'Авторский мультсериал · индивидуально',
                  s.promo==='series')}
              </div>
            </fieldset>
            <p class="calc-hint">
              Сложность сюжета, стилистика и длительность
              обсуждаются отдельно.
            </p>
          ` : `
            <fieldset class="calc-group">
              <legend>02 / Формат видео до 1 минуты</legend>
              <div class="choice-grid">
                ${radio('style','animation',
                  'Мультипликация · 2 000 ₽',
                  s.style==='animation')}
                ${radio('style','realism',
                  'Кинореализм · 5 000 ₽',
                  s.style==='realism')}
                ${radio('style','hybrid',
                  'Реальное видео + AI · 4 000–7 000 ₽',
                  s.style==='hybrid')}
                ${radio('style','edit',
                  'Только монтаж · по запросу',
                  s.style==='edit')}
              </div>
            </fieldset>

            <fieldset class="calc-group">
              <legend>03 / Количество роликов в месяц</legend>
              <div class="input-row">
                <input type="range" name="countRange"
                  min="15" max="60" value="${s.count}"
                  aria-label="Количество роликов">
                <input class="input-number" type="number"
                  name="count" min="15" max="300"
                  value="${s.count}"
                  aria-label="Количество роликов">
              </div>
              <p class="calc-hint">
                Минимальный месячный пакет — 15 роликов.
              </p>
            </fieldset>

            ${(s.mode === 'content' || s.mode === 'full')
              ? `
                <fieldset class="calc-group">
                  <legend>
                    Развёрнутый контент для каналов
                  </legend>
                  ${check('tg',
                    'Telegram · 10–15 публикаций · 15 000 ₽/мес.',
                    s.tg)}
                  ${check('vk',
                    'ВКонтакте · 10–15 публикаций · 15 000 ₽/мес.',
                    s.vk)}
                  <p class="calc-hint">
                    Отдельные авторские материалы, истории,
                    тексты и польза для читателя.
                  </p>
                  ${channels ? `
                    <label class="calc-hint">
                      Публикаций на канал:
                      <strong>${s.posts}</strong>
                    </label>
                    <input type="range" name="posts"
                      min="10" max="15" value="${s.posts}">
                  ` : ''}
                </fieldset>
              ` : ''}

            ${s.mode === 'full' ? `
              <fieldset class="calc-group">
                <legend>Разовая упаковка проекта</legend>
                <div class="choice-grid">
                  ${radio('packageCost','30000',
                    'Разработка · от 30 000 ₽',
                    s.packageCost===30000)}
                  ${radio('packageCost','50000',
                    'Комплексная упаковка · 50 000 ₽',
                    s.packageCost===50000)}
                </div>
                <p class="calc-hint">
                  Позиционирование, УТП, структура воронки,
                  дизайн. Техническое создание бота —
                  отдельно, от 25 000 ₽.
                </p>
              </fieldset>
              <p class="calc-hint">
                Полное сопровождение — от двух месяцев.
                Публикации и текущее ведение включены.
              </p>
            ` : ''}

            <p class="calc-hint">
              Сценарии согласуются заранее. Первый раунд
              правок готового материала бесплатный,
              последующие — платные.
            </p>
          `}
        </div>

        <aside class="calc-aside">
          <p class="eyebrow">ВАШ РАСЧЁТ</p>
          <div class="sum">
            ${promoMode
              ? (s.promo === 'promo'
                  ? 'от 20 000 ₽'
                  : 'Индивидуально')
              : total}
          </div>

          ${promoMode ? `
            <p class="calc-note">
              Стоимость разового проекта уточняется
              после обсуждения.
            </p>
          ` : `
            <p class="calc-note">За месяц</p>

            ${once ? `
              <hr>
              <p class="calc-note">Дополнительно разово</p>
              <div class="small-sum">
                ${s.packageCost===30000 ? 'от ' : ''}
                ${money(once)}
              </div>
            ` : ''}

            <div class="summary-rows">
              <div class="summary-row">
                <span>Видео</span>
                <strong>${s.count} шт.</strong>
              </div>
              <div class="summary-row">
                <span>Стиль</span>
                <strong>${prices[s.style][0]}</strong>
              </div>

              ${(s.mode==='content'||s.mode==='full')
                ? `<div class="summary-row">
                    <span>Каналы</span>
                    <strong>${channels}</strong>
                  </div>`
                : ''}

              ${s.mode==='full'
                ? `<div class="summary-row">
                    <span>Публикации</span>
                    <strong>Включены</strong>
                  </div>`
                : ''}
            </div>
          `}

          <p class="calc-note">
            Предварительная стоимость,
            не окончательная смета.
          </p>

          <button type="button"
            class="btn primary calc-action" data-send-calc>
            Обсудить расчёт ↗
          </button>

          <p class="calc-note">Не знаете, что выбрать?</p>
          <a href="#contact" class="text-link" data-go-contact>
            Просто расскажите о проекте ↗
          </a>
        </aside>
      </div>`;

    $$('input', root).forEach(el =>
      el.addEventListener('change', e => {
        const name = e.target.name;
        let val = e.target.type === 'checkbox'
          ? e.target.checked
          : e.target.value;

        if (name === 'count' || name === 'countRange') {
          val = Math.min(300, Math.max(15, Number(val) || 15));
        }
        if (name === 'posts' || name === 'packageCost') {
          val = Number(val);
        }

        s[name === 'countRange' ? 'count' : name] = val;

        if (s.mode === 'full' && !s.tg && !s.vk) {
          s.tg = true;
        }
        renderBoth();
      })
    );

    const send = $('[data-send-calc]', root);
    if (send) {
      send.onclick = () => toContact(describeCalculation());
    }

    const go = $('[data-go-contact]', root);
    if (go) go.onclick = closeCalculator;
  }

  function renderBoth() {
    renderCalculator($('#calcMount'));
    renderCalculator($('#modalCalcMount'));
  }

  function describeCalculation() {
    const modes = {
      video: 'Пакет видео',
      content: 'Видео и каналы',
      full: 'Полное сопровождение',
      promo: 'Авторский проект'
    };

    const lines = [`Формат: ${modes[s.mode]}`];

    if (s.mode === 'promo') {
      lines.push(
        `Проект: ${s.promo === 'promo'
          ? 'Промо-ролик от 20 000 ₽'
          : 'Мультсериал'}`
      );
    } else {
      const r = calculation();

      lines.push(
        `Видео до минуты: ${s.count}`,
        `Стиль: ${prices[s.style][0]}`
      );

      if (s.mode !== 'video') {
        lines.push(
          `Каналы: ${[
            s.tg ? 'Telegram' : null,
            s.vk ? 'VK' : null
          ].filter(Boolean).join(', ') || 'нет'}`,
          `Публикаций на канал: ${s.posts}`
        );
      }

      lines.push(
        `Ежемесячно: ${r.min === null
          ? 'по согласованию'
          : r.min === r.max
            ? money(r.min)
            : money(r.min) + ' – ' + money(r.max)}`
      );

      if (r.once) {
        lines.push(
          `Разовая упаковка: ${
            s.packageCost === 30000 ? 'от ' : ''
          }${money(r.once)}`
        );
      }
    }

    return lines.join('\n');
  }

  function toContact(text) {
    closeCalculator();

    const textarea = $('#freeMessage');
    if (textarea) {
      textarea.value =
        `Здравствуйте! Хочу обсудить услуги.\n\n` +
        `${text}\n\nО проекте: `;
    }

    $('#contact')?.scrollIntoView({ behavior: 'smooth' });
  }

  function renderSites() {
    const root = $('#siteCalcMount');
    if (!root) return;

    root.innerHTML = `
      <h3 class="calc-title">Рассчитать создание сайта</h3>

      <fieldset class="calc-group">
        <legend>Тип сайта</legend>
        <div class="choice-grid">
          ${radio('kind','simple',
            'Простой одностраничный',site.kind==='simple')}
          ${radio('kind','landing',
            'Авторский лендинг',site.kind==='landing')}
          ${radio('kind','multi',
            'Многостраничный',site.kind==='multi')}
          ${radio('kind','showcase',
            'Сайт-витрина',site.kind==='showcase')}
        </div>
      </fieldset>

      <fieldset class="calc-group">
        <legend>Дизайн</legend>
        <div class="choice-grid">
          ${radio('design','standard',
            'Стандартный',site.design==='standard')}
          ${radio('design','author',
            'Индивидуальный авторский',site.design==='author')}
        </div>
      </fieldset>

      <fieldset class="calc-group">
        <legend>Дополнительно</legend>
        ${check('catalog','Каталог товаров или услуг',
          site.catalog)}
        ${check('motion','Анимации',site.motion)}
        ${check('forms','Формы заявок',site.forms)}
        ${check('calculator','Интерактивный калькулятор',
          site.calculator)}
        ${check('bot','Бот и интеграции',site.bot)}
        ${check('copy','Тексты и структура воронки',
          site.copy)}
      </fieldset>

      <div class="calc-aside" style="position:static">
        <p class="eyebrow">СТАРТОВАЯ ЦЕНА</p>
        <div class="sum">от 10 000 ₽</div>
        <p class="calc-note">
          Стоимость сложных вариантов и опций уточняется
          индивидуально. Мобильная адаптация включена.
        </p>
        <button type="button"
          class="btn primary calc-action" id="siteRequest">
          Обсудить сайт ↗
        </button>
      </div>`;

    $$('input', root).forEach(el =>
      el.addEventListener('change', e => {
        site[e.target.name] = e.target.type === 'checkbox'
          ? e.target.checked
          : e.target.value;
        renderSites();
      })
    );

    $('#siteRequest').onclick = () => {
      const types = {
        simple: 'Простой одностраничный',
        landing: 'Авторский лендинг',
        multi: 'Многостраничный',
        showcase: 'Сайт-витрина'
      };

      const opts = Object.entries({
        catalog: 'Каталог',
        motion: 'Анимации',
        forms: 'Формы',
        calculator: 'Калькулятор',
        bot: 'Бот',
        copy: 'Тексты и воронка'
      })
        .filter(([k]) => site[k])
        .map(([, v]) => v)
        .join(', ') || 'нет';

      toContact(
        `Создание сайта\n` +
        `Тип: ${types[site.kind]}\n` +
        `Дизайн: ${
          site.design === 'author' ? 'Авторский' : 'Стандартный'
        }\n` +
        `Опции: ${opts}\n` +
        `Цена: от 10 000 ₽, точная стоимость уточняется`
      );
    };
  }

  function openCalculator(mode) {
    if (['video','content','full','promo'].includes(mode)) {
      s.mode = mode;
    }

    if ((s.mode === 'content' || s.mode === 'full') &&
        !s.tg && !s.vk) {
      s.tg = true;
    }

    renderBoth();

    const modal = $('#calcModal');
    if (!modal) return;

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeCalculator() {
    const modal = $('#calcModal');
    if (!modal) return;

    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  $$('.js-open-calc').forEach(button =>
    button.addEventListener('click', () =>
      openCalculator(button.dataset.mode)
    )
  );

  $$('[data-close-modal]').forEach(button =>
    button.addEventListener('click', closeCalculator)
  );

  $('#navToggle')?.addEventListener('click', () => {
    const nav = $('#mainNav');
    if (!nav) return;

    nav.classList.toggle('open');

    $('#navToggle').setAttribute(
      'aria-expanded',
      String(nav.classList.contains('open'))
    );
  });

  $$('#mainNav a').forEach(link =>
    link.addEventListener('click', () => {
      $('#mainNav')?.classList.remove('open');
      $('#navToggle')?.setAttribute('aria-expanded', 'false');
    })
  );

  $('#freeLeadForm')?.addEventListener('submit', e => {
    e.preventDefault();

    const status = $('.form-status', e.currentTarget);
    if (status) {
      status.textContent =
        'Это демонстрация. Заявка пока не отправляется: ' +
        'нужна безопасная серверная настройка.';
    }
  });

  const closeVideo = () => {
    const modal = $('#videoModal');
    if (modal) modal.classList.remove('open');

    const container = $('#videoContainer');
    if (container) container.innerHTML = '';

    document.body.style.overflow = '';
  };

  $$('[data-close-video]').forEach(b =>
    b.addEventListener('click', closeVideo)
  );

  $$('[data-video]').forEach(button =>
    button.addEventListener('click', () =>
      alert('Видеоработы добавим после получения оригинальных файлов.')
    )
  );

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeCalculator();
      closeVideo();
    }
  });

  ['linkTg','linkVk','linkIg','linkMail','diskLink']
    .forEach(id => {
      const a = $('#' + id);
      if (!a) return;

      a.addEventListener('click', e => {
        if (a.getAttribute('href')?.startsWith('#')) {
          e.preventDefault();
          alert(
            'Здесь будет твоя ссылка после добавления ' +
            'контактов и материалов.'
          );
        }
      });
    });

  renderBoth();
  renderSites();
})();
