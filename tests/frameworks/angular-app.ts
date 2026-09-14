import '@angular/compiler';
import { Component, CUSTOM_ELEMENTS_SCHEMA, provideZonelessChangeDetection, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { bootstrapApplication } from '@angular/platform-browser';
import { defineTestElement, type } from './fwtest-element.js';

const Orion = (window as any).Orion;
defineTestElement(Orion);

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <o-fwtest ngDefaultControl [(ngModel)]="val" [items]="items" [config]="config" [fmt]="fmt" class="my-class" (o-row-click)="onRow($event)"><span class="kid">child</span></o-fwtest>
    <o-avatar name="Ada Lovelace" size="lg"></o-avatar>
    <output id="val">{{ val() }}</output><output id="rows">{{ rows().join(',') }}</output>`,
})
class App {
  val = signal('hello');
  items = ['x', 'y'];
  config = { a: 1 };
  rows = signal<number[]>([]);
  fmt = (v: string) => String(v).toUpperCase();
  onRow(e: CustomEvent) { this.rows.update(r => [...r, e.detail.id]); }
}
let appRef: any;
bootstrapApplication(App, { providers: [provideZonelessChangeDetection()] }).then(r => { appRef = r; });

(window as any).runTest = async () => {
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
  await wait(200);
  const el: any = document.querySelector('o-fwtest'), res: any = {};
  res.items = Array.isArray(el.items) && el.items.join() === 'x,y';
  res.config = el.config && el.config.a === 1;
  res.fn = typeof el.fmt === 'function' && el.fmt('a') === 'A';
  res.initialValue = el.value === 'hello' && el.querySelector('#inner').value === 'hello';
  res.children = !!el.querySelector('.kid');
  type(el, 'world');
  await wait(120);
  res.ngModelIn = document.getElementById('val')!.textContent === 'world';
  const cmp = appRef.components[0].instance; cmp.val.set('from-ng'); await wait(120);
  res.ngModelOut = el.value === 'from-ng' && el.querySelector('#inner').value === 'from-ng';
  (document.getElementById('rowbtn') as HTMLButtonElement).click();
  await wait(120);
  res.customEvent = document.getElementById('rows')!.textContent === '7';
  res.avatar = document.querySelector('o-avatar')?.textContent === 'AL';
  return res;
};

