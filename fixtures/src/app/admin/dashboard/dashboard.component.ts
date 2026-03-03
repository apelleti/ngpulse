import { Component, signal, computed, effect } from '@angular/core';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent {
  count = signal(0);
  doubled = computed(() => this.count() * 2);
  activeTab = signal<'overview' | 'stats'>('overview');
  isActive = true;
  theme = 'dark';

  constructor() {
    effect(() => {
      console.log('Count changed:', this.count());
    });
  }

  increment() {
    this.count.update(c => c + 1);
  }
}
