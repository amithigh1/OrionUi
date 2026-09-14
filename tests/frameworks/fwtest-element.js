// A test form element exercising props (array/object/function), events and value binding.
export function defineTestElement(Orion) {
  const { FormElement, define } = Orion.core;
  if (customElements.get('o-fwtest')) return;
  class FwTest extends FormElement {
    static props = { ...FormElement.props, value: { type: String, default: '' }, items: { type: Array, default: () => [] }, config: { type: Object, default: () => ({}) }, fmt: { type: Function, attr: false } };
    setup() {
      this.input = Orion.h('input', { class: 'o-input', id: 'inner' });
      this.input.addEventListener('input', () => this.setValue(this.input.value));
      this.btn = Orion.h('button', { id: 'rowbtn', type: 'button' }, 'row');
      this.btn.addEventListener('click', () => this.emit('row-click', { id: 7 }));
      this.prepend(this.input, this.btn);
      this.focusTarget = this.input;
    }
    update(changed) { if (changed.has('value') && this.input.value !== this.value) this.input.value = this.value ?? ''; }
  }
  define('o-fwtest', FwTest);
}
// Simulate a user typing into the inner input
export function type(el, text) { const i = el.querySelector('#inner'); i.value = text; i.dispatchEvent(new Event('input', { bubbles: true })); }
