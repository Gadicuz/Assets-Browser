import { Directive, Input, TemplateRef, ViewContainerRef } from "@angular/core";

interface NgLetContext<T> {
  ngLet: T | null;
}

@Directive({
  selector: "[ngLet]"
})
export class NgLetDirective<T> {
  private context: NgLetContext<T> = { ngLet: null };

  constructor(viewContainerRef: ViewContainerRef, templateRef: TemplateRef<NgLetContext<T>>) {
    viewContainerRef.createEmbeddedView(templateRef, this.context);
  }

  @Input()
  set ngLet(value: T) {
    this.context.ngLet = value;
  }
}
