
"use strict";

(function () {
    namespace("FormsBuilder.Parser", parseJson, columnsJsonParse, getDataProp);
	window.fbParser = FormsBuilder.Parser;
	// // Constants
	
	
	// var CONTROLS_LAYOUT = 'control';

	// var LABEL_GROUP = 'etiqueta';
	// var FORM_LAYOUT = 'formulario > controles';
	// var FORM_ROOT_LAYOUT = 'formulario';

	// var PANEL_LAYOUT = 'panel-default';
	// var PANEL_HEADING_LAYOUT = 'panel-heading';

	// var LIST_SECTIONS_LAYOUT = 'lt-sections';

// Constants
	var GROUP_LAYOUT = 'control[tipoControl="Grupo"]';
	var COLUMN_LAYOUT = 'control[tipoControl="Columna"]';
	var CONTROLS_LAYOUT = 'control';

	var LABEL_GROUP = 'etiqueta';
	var FORM_LAYOUT = 'formulario > controles';
	var FORM_ROOT_LAYOUT = 'formulario';

	var PANEL_LAYOUT = 'panel-default';
	var PANEL_HEADING_LAYOUT = 'panel-heading > h4 > a';

	var LIST_SECTIONS_LAYOUT = 'lt-sections';
    var PATH_ICONOS = "Engine/css/imgs/";

	var data_prop = [];
	var seccionesGrupo = {};

	function getDataProp() {
	    return data_prop;
	}

function parseJson(jsonDoc, callback) {

	console.log(">>>> Inicia 'Parser.parseJson'");

	var domGen = '';

	//$('.panel-sections .panel-title').html($(xmlDoc).find('formulario').attr('nombre'));


	FormsBuilder.Catalogs.init(jsonDoc.catalogos);

	FormsBuilder.XMLForm.initJson(jsonDoc);

	navigationGroupMenuJsonParse(jsonDoc.navegacion);

	callback();

}

function navigationGroupMenuJsonParse(navegacion) {
    /*var gruposNavegacion = navegacion.agrupador;
    var template = "<div id='{0}' >" +
        "" +
        "<div id='collapse{0}' ><div class='panel-body'></div></div>";
    var controles = FormsBuilder.XMLForm.getControles();
    var contenedorPanel = $("<div class='panel-group' id='groupcontainer'></div>");
    var contenedor = $("#htmlOutput");*/
	//debugger;
	var gruposNavegacion = navegacion.agrupador;
    var template = "<div id='tab{0}' class='{1}'>" +
        "" +
        "<div class='panel-body'></div></div>";
	var templateLi = "<li class='{0}' style='width: {1}%;'><a data-toggle='tab' href='#tab{2}'>{3}</a></li>";
    var controles = FormsBuilder.XMLForm.getControles();
    var contenedorPadre = $("<div class='panel-group' id='groupcontainer'></div>");
	var contenedorUl = $("<ul id='firstUl' class='topmenu topmenuV2  col-xs-12 col-sm-12 nav nav-tabs'></div>");
	var contenedorTabs = $("<div id='firstTab' class='tab-content'></div>");
    var contenedor = $("#htmlOutput");

	var width = 100 / gruposNavegacion.length;
    contenedor.html("");
	
    $.each(gruposNavegacion, function (key, grupo) {
        var titulo = grupo.titulo;
        var idGrupo = grupo.id;
        var idEntidadPropiedad = grupo.idEntidadPropiedad;
        var secciones = grupo.seccion;
        var diagramacion = [];
        var htmlGrupo = "";
        var htmlControles = "";
		var htmlLi ="";
		var liClass = key === 0 ? "active" : null;
		var tabClass = key === 0 ? "tab-pane active" : "tab-pane fade";

        for (var i = 0; i < secciones.length; i++) {
            var seccion = secciones[i];
            var controlesSeccion = Enumerable.From(controles).Where("$.control.id == '{0}'".format(seccion.idControlFormulario)).FirstOrDefault();

            diagramacion.push(controlesSeccion);
        }

        htmlControles = sectionJsonParse(diagramacion, true);
        htmlGrupo = $(template.format(idGrupo, tabClass));
        htmlGrupo.find(".panel-body").append(htmlControles);
		htmlLi = $(templateLi.format(liClass,width,idGrupo, titulo))

        if (grupo.icono) {
            //htmlGrupo.find("h4 > a").prepend("<img src='{0}' />".format(PATH_ICONOS + grupo.icono));
        }
		contenedorUl.append(htmlLi);
        contenedorTabs.append(htmlGrupo);
    });

	contenedorPadre.append(contenedorUl);
	contenedorPadre.append(contenedorTabs);
    contenedor.append(contenedorPadre);
}

function sectionJsonParse(grupos, sonSecciones) {
    var nuevoElemento = "";
    var navegacion = FormsBuilder.XMLForm.getNavegacion()["agrupador"];
    var seccionesNavegacion = Enumerable.From(navegacion).SelectMany("$.seccion").ToArray();
    var template = "<li class='{0}' style='width: {1}%;'><a data-toggle='tab' href='#tab{2}'>{3}</a></li>";
    var width = 100 / grupos.length;
    var lista = $("<ul id='secondUl' class='topmenu topmenuV2  col-xs-12 col-sm-12 nav nav-tabs'></ul>");
    var contenedorTabs = $("<div class='tab-content'></div>");    
    var seccion = $("<div></div>");
	var divBotones = $("<div class='headerbtnFinal' style='width:100% !important; margin:0 auto; padding: 15px 20px 20px 20px;'>" +
            "<a id='btnRegresarPms' style='float:right' class='btn btn-primary icon'>Regresar</a></div>");
    contenedorTabs.append(divBotones);

    $.each(grupos, function (key, grapedGroup) {
        var group = grapedGroup.control;
        var seccionNavegacion = Enumerable.From(seccionesNavegacion).Where("$.idControlFormulario == '{0}'".format(group.id)).FirstOrDefault();
        var titulo = seccionNavegacion.tituloSeccion ? seccionNavegacion.tituloSeccion : "";
        var columnasGrupo = group.controles.control;
        var tabClass = key === 0 ? "tab-pane active" : "tab-pane fade";
        var liClass = key === 0 ? "active" : null;
            var tab = $("<div id='tab{0}' class='{1}'></div>".format(group.id, tabClass));
            var elementoLista = $(template.format(liClass, width, group.id, titulo));
            columnsJsonParse(columnasGrupo, tab);            

            lista.append(elementoLista);
            contenedorTabs.append(tab);
    });

    seccion.append(lista);
    seccion.append(contenedorTabs);

    return seccion.html();
}

function groupsJsonParseAccordion(groups, areMainGroups) {
		var domGenerated = '';
		var paneldinamico= null;
		var columnasFixed= null;
		var title =null;
		$.each(groups, function (key, grapedGroup) {
			var group = grapedGroup.control;
			var panelNewDiv;
			
			if (areMainGroups) {
				panelNewDiv = $('<div><div class="panel panel-default ficha-collapse"><div class="panel-heading" role="tab"><h4 class="panel-title"><a role="button" data-toggle="collapse" data-parent="#accordion" href="#collapseOne" aria-expanded="true" aria-controls="collapseOne">Datos generales</a></h4></div><div id="collapseOne" class="panel-collapse collapsing" role="tabpanel" aria-labelledby="headingOne"><div class="panel-body"></div></div></div></div>'.format(PANEL_LAYOUT));
			} else {
				var tituloLargoGroup = group.atributos ? Enumerable.From(group.atributos.atributo).Where("$.nombre='TituloLargo'").FirstOrDefault() : null;

				if (tituloLargoGroup) {
					var styleTituloGrupo = 'border-left: solid 1px lightgray; border-top: solid 1px lightgray; border-right: solid 1px lightgray; margin-bottom: 2px;';
					var styleH5 = 'background-color: lightgray; padding: 5px;';

					panelNewDiv = $('<div><div style="{0}" class="panel-body"><h5 style="{1}" tituloGrupo="">{2}</h5></div></div>'.format(styleTituloGrupo, styleH5, tituloLargoGroup.valor || ''));
				} else {
					panelNewDiv = $('<div><div class="panel-body"></div></div>');
				}
			}
			 
			var identifier = "A{0}".format(group.id);
			if(group.atributos!= undefined)
			{
				if(Enumerable.From(group.atributos.atributo)
					.Where("$.nombre == 'ocultar' && $.valor=='1'")
					.Count()>0)
				{

					panelNewDiv.find('.' + PANEL_LAYOUT).hide();
				}


				paneldinamico =	Enumerable.From(group.atributos.atributo).Where("$.nombre == 'Panel'").FirstOrDefault();
				columnasFixed =Enumerable.From(group.atributos.atributo).Where("$.nombre == 'ColumnasFixed'").FirstOrDefault();
				title = Enumerable.From(group.atributos.atributo).Where("$.nombre == 'TituloLargo'").FirstOrDefault();
			}

			panelNewDiv.find('.' + PANEL_LAYOUT).attr("id", "A{0}".format(group.id));
			panelNewDiv.find('.' + PANEL_LAYOUT).attr("idEntidadPropiedad", group.idEntidadPropiedad);
			panelNewDiv.find('.' + PANEL_HEADING_LAYOUT).attr('href', '#collapse' + identifier);
			panelNewDiv.find('#collapseOne').attr('id', 'collapse' + identifier);
			//panelNewDiv.find('.' + PANEL_LAYOUT).hide();
			//seccionesUI[group.idEntidadPropiedad] = "A{0}".format(group.id);

			FormsBuilder.ViewModel.getFlujoSecciones()[group.idEntidadPropiedad] = {};
			FormsBuilder.ViewModel.getFlujoSecciones()[group.idEntidadPropiedad]['EntroSeccion'] = false;

			/*TODO
			if ($(group).parents().eq(1)[0].nodeName === FORM_ROOT_LAYOUT) {
				panelNewDiv.find('.' + PANEL_LAYOUT).attr("id", "A{0}".format($(group).attr('id')));
				panelNewDiv.find('.' + PANEL_LAYOUT).attr("idEntidadPropiedad", $(group).attr('idEntidadPropiedad'));
				panelNewDiv.find('.' + PANEL_LAYOUT).hide();
				seccionesUI[$(group).attr('idEntidadPropiedad')] = "A{0}".format($(group).attr('id'));

				FormsBuilder.ViewModel.getFlujoSecciones()[$(group).attr('idEntidadPropiedad')] = {};
				FormsBuilder.ViewModel.getFlujoSecciones()[$(group).attr('idEntidadPropiedad')]['EntroSeccion'] = false;
			}
			*/

			

			if (paneldinamico!= null) {
				panelNewDiv.find('.' + PANEL_LAYOUT).attr('PanelDinamico', paneldinamico.valor || '');
			}

			
			if (columnasFixed!=null) {
				panelNewDiv.find('.' + PANEL_LAYOUT).attr('ColumnasFixed', '');
			}

			
			if (title!= null) {
				//panelNewDiv.find('.' + PANEL_LAYOUT).prepend('<div class="{0}"></div>'.format(PANEL_HEADING_LAYOUT));

				panelNewDiv.find('.' + PANEL_HEADING_LAYOUT).html(title.valor);
			}
			
			//var columns = Enumerable.From(group.controles.control).Where("$.tipoControl== 'Columna'").ToArray();
			var columns;
			if(group.controles.control instanceof Array)
			{
				columns=group.controles.control;
			}
			else
			{
				columns=[group.controles.control];
			}
			panelNewDiv = columnsJsonParse(columns, panelNewDiv);

			domGenerated += panelNewDiv.html();
			
		});

		return domGenerated;
	}

function grupsJsonParse(grupos) {
    var paneldinamico = null;
    var columnasFixed = null;
    var template = "<div id='{0}' class='bdV2' data-tipocontenedor='fila'>{1}<div class='panel-body'></div></div>";
    var panelBody = $("<div></div>");

    $.each(grupos, function (key, group) {
        var titulo = (group.atributos && group.atributos.atributo) ? Enumerable.From(group.atributos.atributo).Where("$.nombre='TituloLargo'").FirstOrDefault() : null;
        var columnasGrupo = group.controles.control;
        var idGrupo = "A{0}".format(group.id);
        var panel = $(template.format(idGrupo, titulo ? titulo.valor : ""));
        
        panel.attr("idEntidadPropiedad", group.idEntidadPropiedad);
        columnsJsonParse(columnasGrupo, panel.find(".panel-body"));

        panelBody.append(panel);

        if (group.atributos != undefined) {
            if (Enumerable.From(group.atributos.atributo)
                .Where("$.nombre == 'ocultar' && $.valor=='1'")
                .Count() > 0) {

                nuevoElemento.hide();
            }

            paneldinamico = Enumerable.From(group.atributos.atributo).Where("$.nombre == 'Panel'").FirstOrDefault();
            columnasFixed = Enumerable.From(group.atributos.atributo).Where("$.nombre == 'ColumnasFixed'").FirstOrDefault();
        }

        FormsBuilder.ViewModel.getFlujoSecciones()[group.idEntidadPropiedad] = {};
        FormsBuilder.ViewModel.getFlujoSecciones()[group.idEntidadPropiedad]['EntroSeccion'] = false;

        if (paneldinamico != null) {
            nuevoElemento.attr('PanelDinamico', paneldinamico.valor || '');
        }


        if (columnasFixed != null) {
            nuevoElemento.attr('ColumnasFixed', '');
        }
    });

    return panelBody.html();
}


	function columnsJsonParse(columns, panelNewDiv) {
		$.each(columns, function (key, column) {

            if (!column.controles) {
                column.controles = {"control": []};
            } else if (!column.controles.control) {
                column.controles.control = [];
            }
            
			var childGroups =   Enumerable.From(column.controles.control).Where("$.tipoControl== 'Grupo'").ToArray();
			//var childGroups = $(column).children('controles').children(GROUP_LAYOUT);

			var containerDiv = $('<div><div class="title-column" ></div><div class="bd" data-tipocontenedor="columna"></div></div>');
			if (column.width !== undefined) {
				containerDiv.find('.bd').css({ 'width': $(column).attr('width') });
			} else {
				if (columns.length === 1) {
					containerDiv.find('.bd').css({ 'width': '100%' });
				} else {
					containerDiv.find('.bd').css({ 'width': ((98 / columns.length)) + '%' });
				}
			}
            
            containerDiv.find('.bd').attr("style", containerDiv.find('.bd').attr("style") + " float: left;");

            if (!(column.controles.control instanceof Array)) {
                column.controles.control = [column.controles.control];
            }
                
            var controlHtml = controlsJsonParse(column);
            var fcontainer = containerDiv.find('.bd:first');

            fcontainer.append(controlHtml);

			if (childGroups.length > 0) {
				var childRecursiveNodes = grupsJsonParse(childGroups);
				containerDiv.find('.bd:first').append(childRecursiveNodes);                
			}

			panelNewDiv.append(containerDiv.html());
		});

		return panelNewDiv;
	}

	function controlsJsonParse(column) {
        
		var controlHtml = '';
		$.each(column.controles.control, function (key, control) {
            if (control.controles && control.controles.control && !(Array.isArray(control.controles.control))) {
                control.controles.control = [control.controles.control];
            }

            if (control.idPropiedad == '12031001') {
                var declaracion = AppDeclaracionesSAT.getConfig('configuracionDeclaracion');
                var ctrlTitulo = '';
                if (declaracion.OpcionCalculoISR == 'IG') {
                    ctrlTitulo = '<div class="col-sm-12" style="padding-bottom:10px; text-decoration: underline"><h3><stron class="ocisr">Determinaci&oacute;n del ISR con gastos</strong></h3></div>';
                }
                else if (declaracion.OpcionCalculoISR == 'CU') {
                    ctrlTitulo = '<div class="col-sm-12" style="padding-bottom:10px; text-decoration: underline"><h3><stron class="ocisr">Determinaci&oacute;n del ISR con coeficiente de utilidad</strong></h3></div>';
                }
                else{
                    ctrlTitulo = '<div class="col-sm-12" style="padding-bottom:10px; text-decoration: underline"><h3><stron class="ocisr"></strong></h3></div>';
                }

                controlHtml += ctrlTitulo + '<div class="clear"></div>';
            }

            controlHtml += FormsBuilder.HTMLBuilder.generate(control);

		});

		return controlHtml;
	}


})();
