import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { Chart, ChartConfiguration, ChartData, ChartOptions, ChartType, registerables } from 'chart.js';

Chart.register(...registerables);

/**
 * Thin standalone wrapper around Chart.js. Renders a chart on a canvas and
 * re-draws whenever the bound `type`, `data` or `options` change. Sized by its
 * container (set a height on the host element or wrapper).
 */
@Component({
  selector: 'app-chart',
  standalone: true,
  template: `<div class="chart-host"><canvas #canvas></canvas></div>`,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }
      .chart-host {
        position: relative;
        width: 100%;
        height: 100%;
        min-height: 220px;
      }
    `,
  ],
})
export class ChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() type: ChartType = 'bar';
  @Input() data: ChartData = { labels: [], datasets: [] };
  @Input() options: ChartOptions = {};

  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private chart?: Chart;
  private viewReady = false;

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.render();
  }

  ngOnChanges(): void {
    if (this.viewReady) this.render();
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  private render(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    this.chart?.destroy();
    const config: ChartConfiguration = {
      type: this.type,
      data: this.data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } },
        },
        ...this.options,
      },
    };
    this.chart = new Chart(canvas, config);
  }
}
