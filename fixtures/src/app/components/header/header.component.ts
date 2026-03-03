import { Component, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
})
export class HeaderComponent {
  title = signal('Demo App');
  upperTitle = computed(() => this.title().toUpperCase());

  constructor() {
    effect(() => {
      document.title = this.title();
    });
  }

  updateTitle(newTitle: string) {
    this.title.set(newTitle);
  }
}
