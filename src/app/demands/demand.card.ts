import { Component, OnInit, Input } from '@angular/core';

import { DemandInfo } from './demands.models';

@Component({
  selector: 'app-demand-card',
  templateUrl: './demand.card.html',
  styleUrls: ['./demand.card.css']
})
export class DemandCard implements OnInit {

  @Input() data: DemandInfo;

  ngOnInit() {}

}
