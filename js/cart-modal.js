(function () {
  const nativeAlert = window.alert.bind(window);

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('is-open');
    document.body.classList.remove('cart-modal-open');
    setTimeout(() => modal.remove(), 180);
  }

  function showAddedToCartModal() {
    document.querySelector('.cart-confirmation-modal')?.remove();

    const productName = document.querySelector('#product-detail h1')?.textContent?.trim() || 'Your item';
    const productImage = document.querySelector('#product-detail .main-image img')?.src || '';

    const modal = document.createElement('div');
    modal.className = 'cart-confirmation-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'cart-confirmation-title');

    const backdrop = document.createElement('button');
    backdrop.type = 'button';
    backdrop.className = 'cart-confirmation-backdrop';
    backdrop.setAttribute('aria-label', 'Close cart confirmation');

    const panel = document.createElement('div');
    panel.className = 'cart-confirmation-panel';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'cart-confirmation-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '×';

    const icon = document.createElement('div');
    icon.className = 'cart-confirmation-icon';
    icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

    const eyebrow = document.createElement('p');
    eyebrow.className = 'cart-confirmation-eyebrow';
    eyebrow.textContent = 'SARAH CRAFT STUDIO';

    const title = document.createElement('h2');
    title.id = 'cart-confirmation-title';
    title.textContent = 'Added to your cart';

    const message = document.createElement('p');
    message.className = 'cart-confirmation-message';
    message.textContent = `${productName} is now in your shopping cart.`;

    const product = document.createElement('div');
    product.className = 'cart-confirmation-product';
    if (productImage) {
      const img = document.createElement('img');
      img.src = productImage;
      img.alt = '';
      product.appendChild(img);
    }
    const productText = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = productName;
    const small = document.createElement('small');
    small.textContent = 'Ready whenever you are ✨';
    productText.append(strong, small);
    product.appendChild(productText);

    const actions = document.createElement('div');
    actions.className = 'cart-confirmation-actions';

    const continueButton = document.createElement('button');
    continueButton.type = 'button';
    continueButton.className = 'btn secondary';
    continueButton.textContent = 'Continue shopping';

    const cartLink = document.createElement('a');
    cartLink.className = 'btn';
    cartLink.href = '/cart.html';
    cartLink.textContent = 'View cart';

    actions.append(continueButton, cartLink);
    panel.append(close, icon, eyebrow, title, message, product, actions);
    modal.append(backdrop, panel);
    document.body.appendChild(modal);

    backdrop.addEventListener('click', () => closeModal(modal));
    close.addEventListener('click', () => closeModal(modal));
    continueButton.addEventListener('click', () => closeModal(modal));
    document.addEventListener('keydown', function onKeydown(event) {
      if (event.key === 'Escape') {
        closeModal(modal);
        document.removeEventListener('keydown', onKeydown);
      }
    });

    document.body.classList.add('cart-modal-open');
    requestAnimationFrame(() => {
      modal.classList.add('is-open');
      continueButton.focus();
    });
  }

  window.alert = function (message) {
    if (String(message).trim().toLowerCase() === 'added to cart') {
      showAddedToCartModal();
      return;
    }
    nativeAlert(message);
  };
})();
