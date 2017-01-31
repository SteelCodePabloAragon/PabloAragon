/** @module AppDeclaracionesSAT */
/**
* Modulo de punto de entrada de la aplicacion, que carga datos iniciales
* e inicia eventos del DOM
*
* (c) SAT 2013, Iván González
*/
/*global namespace:false, FormsBuilder:false, SAT: false, AppDeclaracionesSAT:false, ko:false, Base64:false */

"use strict";

(function () {
    namespace("AppDeclaracionesSAT", initStepThree, loadStepThree, initStepFour, initProxyDivs, initProxyDivsStepfour,
         cargarXmlDisco, precargaInformacion, generarEncabezado, initProxyDivsSign, habilitarCamposC26, precargaAnexoPersonaFisica,
         cargandoPaso, obtenerCamposC26);

    var catalogos = {};
    var numCatalogos = 0;
    var tipoPersona = '';

    var TipoDeclaracion = {
        Normal: '001'
    };

    function initProxyDivs() {
        $('.sat-div-contenedores').bind("DOMSubtreeModified", function () {
            switch ($(this).attr("id")) {
                case "DVPLANFOR":
                    cargandoPaso(20);
                    SAT.Environment.setSetting('loadXMLTemplate', true);
                    if (!SAT.Environment.settings('loadXMLTemplate')) {
                        if ($(this).html() !== "") {
                            var xmlDoc = fbXmlForm.reconstructXml();
                            $(this).remove();
                            loadStepThree(xmlDoc);
                        }
                    }
                    break;

                case "DVCA01":
                    if ($(this).html() !== "") {
                        var xmlDoc = $.parseXML(Base64.decode($(this).html()));
                        $(this).remove();
                        loadCombobox(xmlDoc, 'ejercicio');
                    }
                    break;

                case "DVCA04":
                    if ($(this).html() !== "") {
                        var xmlDoc = $.parseXML(Base64.decode($(this).html()));
                        $(this).remove();
                        loadCombobox(xmlDoc, 'tipodeclaracion');
                    }
                    break;

                case "DVCA05":
                    if ($(this).html() !== "") {
                        var xmlDoc = $.parseXML(Base64.decode($(this).html()));
                        $(this).remove();
                        loadCombobox(xmlDoc, 'tipocomplementaria');
                    }
                    break;

                case "DVCA03":
                    if ($(this).html() !== "") {
                        var xmlDoc = $.parseXML(Base64.decode($(this).html()));
                        $(this).remove();
                        loadComboboxPeriodo(xmlDoc);
                    }
                    break;

                case "DVCA06":
                    if ($(this).html() !== "") {
                        var xmlDoc = $.parseXML(Base64.decode($(this).html()));
                        $(this).remove();
                        loadCombobox(xmlDoc, 'regimenes');
                    }
                    break;
                case "DVCA07":
                    if ($(this).html() !== "") {
                        var xmlDoc = $.parseXML(Base64.decode($(this).html()));
                        loadCombobox(xmlDoc, 'subregimenes', function () {
                        });
                    }
                    break;
                case "DVCA08":
                    if ($(this).html() !== "") {
                        var xmlDoc = $.parseXML(Base64.decode($(this).html()));
                        loadCombobox(xmlDoc, 'areasgeograficas', function () {
                        });
                    }
                    break;
                case "DVOFRMGRD":
                    var formularios = JSON.parse($(this).html());
                    $('.sat-list-forms ul li').remove();

                    $.each(formularios, function (k, v) {
                        var forma = $($('.tplformas').html());
                        forma.find('span').html(v.nombre);
                        forma.attr('idForma', v.idForma);

                        if ($('.sat-list-forms ul').hasClass("item-removing")) {
                            forma.find('span').append("<a class='close' idForma='{0}' forma='{1}' href='javascript:void(0);'><i class='icon-trash'></i></a>".format(v.idForma, v.nombre));
                        }

                        var element = $("<li>").append(forma);
                        element.addClass("list-group-item");

                        $('.sat-list-forms ul').append(element);
                    });

                    $('.sat-list-forms ul li a').on('dblclick', function () {
                        var operacion = {
                            operacion: "OPCARGATEMP",
                            parametros: { idForma: $(this).attr("idForma") }
                        };
                        $('#DVOPER').html(JSON.stringify(operacion));
                    });

                    $('.sat-list-forms ul li a span a.close').tooltip({ title: 'Eliminar', trigger: 'hover focus' });
                    $('.sat-list-forms ul li a span a.close').on('click', function () {
                        $("#modal-confirm-delete").modal("show");
                        $("#modal-confirm-delete #mensaje-confirmacion strong").html("{0}");
                        var mensaje = $("#modal-confirm-delete #mensaje-confirmacion").html();

                        $("#modal-confirm-delete #confimar-eleminacion").attr("idForma", $(this).attr("idForma"));
                        $("#modal-confirm-delete #mensaje-confirmacion").html(mensaje.format($(this).attr("forma")));
                    });

                    $('#myModal').modal('hide');
                    break;

                case "DVDECLARACIONDISCO":
                    var declaracion = $.parseXML(Base64.decode($(this).html()));

                    if (declaracion === null) break;

                    if (SAT.Environment.settings('esquemaanterior') === true) {
                        $('#myModal').modal('hide');
                        break;
                    }
                    AppDeclaracionesSAT.initGrids();
                    cargarXmlDisco(declaracion, function (camposC26) {
                        if (SAT.Environment.settings('dejarsinefecto') === true || SAT.Environment.settings('actualizacionimporte') === true) {
                            FormsBuilder.Runtime.initFormulario();
                            $('#htmlOutput').find('[view-model]').attr("disabled", true);
                            $('.btncollapse').attr("disabled", true);
                            $('.calculoinversion').attr("disabled", true);
                            $('.calculoAmortizacion').attr("disabled", true);
                            $('.panel').find('button.btnAddCtrlGridRow, button.btnDelCtrlGridRow').attr("disabled", true);
                            $('button.btnAddFormularioGridRow, button.btnDelFormularioGridRow, button.btnCancelFormularioGridEdicionRow, button.btnSaveFormularioGridEdicionRow, button.cargaMasivaRetenciones').attr("disabled", true);
                            $('a.sat-button-dialog').attr('disabled', true);

                            var declaracion = FormsBuilder.XMLForm.getCopyDeclaracion();
                            var menusOcultos = declaracion.find('entidad[ocultarmenuseccion="true"]');
                            $.each(menusOcultos, function (key, menuOculto) {
                                var panel = $('#htmlOutput .panel[identidadpropiedad="{0}"]'.format($(menuOculto).attr('id')));
                                var ancla = $('.container-submenus li a[idPanel="{0}"]'.format(panel.attr('id')));
                                ancla.parent().hide();
                            });
                        }

                        // if (SAT.Environment.settings('actualizacionimporte') === true) {
                        //     actualizacionimporte
                        // }

                        if (SAT.Environment.settings('verificarfechapagoanterioridad') === true) {
                            habilitarCamposC26(camposC26);
                        }

                        var operacion = {
                            operacion: "OPCARGADECLARACION",
                            parametros: {}
                        };
                        $('#DVOPER').html(JSON.stringify(operacion));
                    });
                    break;

                case "DVDAPREFOR":
                    var precarga = $.parseXML(Base64.decode($(this).html()));
                    precargaInformacion(precarga, AppDeclaracionesSAT.initGrids);
                    break;

                case "DVDAPREFORCOMP":
                    var precarga = $.parseXML(Base64.decode($(this).html()));
                    AppDeclaracionesSAT.setConfig('complementaria', 'true');

                    console.log('Inicia Precarga Complementaria...');

                    precargaInformacionComplementaria(precarga);
                    break;

                case "DVACUSE":
                    var urlAcuse = Base64.decode($(this).html());
                    $('#acuse').attr('src', urlAcuse);
                    break;

                case "DVINFOCON":
                    var infoContribuyente = JSON.parse($(this).html());
                    for (var prop in infoContribuyente) {
                        AppDeclaracionesSAT.setConfig(prop, infoContribuyente[prop]);
                    }

                    $('#nombreContribuyente').html(infoContribuyente.nombre);
                    $('#rfc').html(infoContribuyente.rfc);
                    tipoPersona = infoContribuyente.tipopersona;

                    SAT.Environment.setSetting('tipopersona', tipoPersona);
                    SAT.Environment.setSetting('forma', infoContribuyente.forma);

                    if (AppDeclaracionesSAT.getConfig('tipocomplementaria') === AppDeclaracionesSAT.getConst('TipoComplementariaDejarSinEfecto')) {
                        console.log('Dejar sin efecto');

                        SAT.Environment.setSetting('dejarsinefecto', true);
                    }

                    if (AppDeclaracionesSAT.getConfig('tipocomplementaria') === AppDeclaracionesSAT.getConst('TipoComplementariaActualizacionDeImporte')) {
                        console.log('Actualizacion de importe');

                        SAT.Environment.setSetting('actualizacionimporte', true);
                    }

                    if (AppDeclaracionesSAT.getConfig('tipocomplementaria') === AppDeclaracionesSAT.getConst('TipoComplementariaEsquemaAnterior') &&
                        AppDeclaracionesSAT.getConfig('tipodeclaracion') === AppDeclaracionesSAT.getConst('TipoDeclaracionComplementaria')) {
                        console.log('Esquema anterior');

                        SAT.Environment.setSetting('esquemaanterior', true);
                    }

                    if (AppDeclaracionesSAT.getConfig('tipocomplementaria') === AppDeclaracionesSAT.getConst('TipoComplementariaDejarSinEfecto') ||
                        AppDeclaracionesSAT.getConfig('tipocomplementaria') === AppDeclaracionesSAT.getConst('TipoComplementariaModificacionObligaciones')) {

                        SAT.Environment.setSetting('verificarfechapagoanterioridad', true);
                    }

                    var encabezado = generarEncabezado(infoContribuyente);

                    $('.info-declara b').text(encabezado);

                    var operacion = {
                        operacion: "OPINFOCONCAR",
                        parametros: {}
                    };
                    $('#DVOPER').html(JSON.stringify(operacion));
                    break;

                case "DVRFCCOMBO":
                    if ($(this).html() !== "") {
                        var formularios = JSON.parse($(this).html());

                        var elementAdding = '';

                        $.each(formularios, function (k, v) {
                            elementAdding += '<option value="{0}">{1}</option>'.format($(v).attr("id"), $(v).attr("descripcion"));
                        });

                        $('#rfcCombo').html(elementAdding);
                    }
                    break;

                case "DVINFOALERTCLIENT":
                    if (IsNullOrEmpty($(this).html())) return;

                    var alertObject = JSON.parse($(this).html());

                    $("#modalAlertClient div.modal-body").html(alertObject.mensaje);
                    $("#modalAlertClient div.modal-footer button").click(function () {
                        var operacion = {
                            operacion: "OPERALERTERROR",
                            parametros: { origen: alertObject.origen }
                        };
                        $('#DVOPER').html(JSON.stringify(operacion));
                        $("#modalAlertClient").modal('hide');
                    });

                    $("#modalAlertClient").modal('show');
                    break;

                case "DVCONFSOBREESC":
                    if (IsNullOrEmpty($(this).html()) || $(this).html() == '-') return;

                    $("#modal-confirm-delete").modal("show");
                    $("#modal-confirm-delete #confimar-eleminacion").attr("respuesta", "SI");
                    $(this).html('-')
                    break;


                case "DVINITRETENCIONES":
                    if (!IsNullOrEmpty($(this).html())) {
                        var plataforma = JSON.parse($(this).html());
                        if (plataforma.tipo === 1) {
                            Service.Test.recuperaPaginaMasiva();
                        }
                    }
                    break;

                case "DVRETENCIONES":
                    if ($(this).html() !== "" && $(this).html() !== "-") {
                        var retenciones = JSON.parse($(this).html());
                        if (retenciones.tipo === 0) {

                            FormsBuilder.Modules.initMassive(
                            retenciones.paginas,
                            retenciones.numElementos,
                            retenciones.entidad,
                            retenciones.updates);


                        } if (retenciones.tipo === 1) {
                            FormsBuilder.Modules.loadRetenciones(retenciones.elementos, retenciones.entidad);
                        } if (retenciones.tipo === 2) {
                            FormsBuilder.Modules.deleteRetenciones(retenciones.updates, retenciones.entidad);
                        }
                        $(this).html("-");
                    }
                    break;
            }
        });
    }

    function initProxyDivsSign() {
        $('.sat-div-sign').bind("DOMSubtreeModified", function () {
            switch ($(this).attr("id")) {
                case 'DVRFC':
                    var rfc = $(this).html();
                    $("#sign-modal #inputRFC").val(rfc);
                    break;
                case 'DVKEY':
                    var key = $(this).html();
                    $("#sign-modal #inputLlavePrivada").val(key);
                    break;
                case 'DVCER':
                    var cer = $(this).html();
                    $("#sign-modal #inputCert").val(cer);
                    break;
                case "DVINFOALERTCLIENT":
                    if (IsNullOrEmpty($(this).html())) return;

                    var alertObject = JSON.parse($(this).html());

                    $("#modalAlertClient div.modal-body").html(alertObject.mensaje);
                    $("#modalAlertClient div.modal-footer button").click(function () {
                        var operacion = {
                            operacion: "OPERALERTERROR",
                            parametros: { origen: alertObject.origen }
                        };
                        $('#DVOPER').html(JSON.stringify(operacion));
                        $("#modalAlertClient").modal('hide');
                    });

                    $("#modalAlertClient").modal('show');
                    break;
            }
        });

    }

    function generarEncabezado(infoContribuyente) {
        if (infoContribuyente) {
            if (infoContribuyente.tipodeclaraciontexto) {
                var encabezado = "Tipo de Declaración: {0} / ".format(infoContribuyente.tipodeclaraciontexto || "N/A");
                if (infoContribuyente.tipocomplementariatexto) {
                    encabezado = encabezado.concat(" {0} / ".format(infoContribuyente.tipocomplementariatexto));
                }
                encabezado = encabezado.concat("Ejercicio: {0} / ".format(infoContribuyente.ejercicio || "N/A"));
                encabezado = encabezado.concat("Periodo: {0}".format(infoContribuyente.periodotexto || "N/A"));
                return encabezado;
            }
            return "";

        }
        else {
            return "";
        }
    }

    function initProxyDivsStepfour() {
        $('.sat-div-contenedores').bind("DOMSubtreeModified", function () {
            switch ($(this).attr("id")) {
                case "DVINFOCON":
                    var infoContribuyente = JSON.parse($(this).html());
                    for (var prop in infoContribuyente) {
                        AppDeclaracionesSAT.setConfig(prop, infoContribuyente[prop]);
                    }

                    $('#nombreContribuyente').html(infoContribuyente.nombre);
                    $('#rfc').html(infoContribuyente.rfc);
                    tipoPersona = infoContribuyente.tipopersona;

                    var encabezado = generarEncabezado(infoContribuyente);

                    $('.informacion-declaracion b').text(encabezado);

                    var operacion = {
                        operacion: "OPINFOCONCAR",
                        parametros: {}
                    };
                    $('#DVOPER').html(JSON.stringify(operacion));
                    break;

                case "DVINFOALERTCLIENT":
                    if (IsNullOrEmpty($(this).html())) return;

                    var alertObject = JSON.parse($(this).html());

                    $("#modalAlertClient div.modal-body").html(alertObject.mensaje);
                    $("#modalAlertClient div.modal-footer button").click(function () {
                        var operacion = {
                            operacion: "OPERALERTERROR",
                            parametros: { origen: alertObject.origen }
                        };
                        $('#DVOPER').html(JSON.stringify(operacion));
                        $("#modalAlertClient").modal('hide');
                    });

                    $("#modalAlertClient").modal('show');
                    break;

                case "DVPDFDECLARACION":
                    var titleAndDeclaracion = JSON.parse(Base64.decode($(this).html()));

                    var iframePDF = '<iframe src="{0}" frameborder="0" height="460" width="100%"></iframe>'.format(titleAndDeclaracion.url);

                    $("#htmlOutput").html(iframePDF);

                    $("div.title-declaracion").html(titleAndDeclaracion.titulo);

                    AppDeclaracionesSAT.inicializarEventosPasoRevisionEnvio();
                    break;
            }
        });
    }



    function initStepThree() {
        $('#myModal').modal('show');     
    }

    function initStepFour() {
        $('#myModal').modal('show');

        // Helper.Test.readPlantilla(function(data) {
        //     loadStepFour(data);
        // });

        if (AppDeclaracionesSAT.getConfig('readonly') === true) {
            console.log('Quitar elementos de navegación.');
            setTimeout(function () {
                $('#enviarDeclaracion, #btnEnviarDeclara').addClass('hide');
                $('input, select').attr('disabled', 'disabled');
            }, 1000);
        }
    }

    function remueveEstilosAsinc() {
        //Quitamos 50% de Tabs en firstUl
        $("#firstUl  li").css('width', 'auto');
        $("#firstUl li a").css("border-right", "none");
    }

    function loadStepThree(data) {

        var reading = function () {
           
            //Helper.Test.readPrecarga(function (precargaXml) {

            //    precargaInformacion(precargaXml, AppDeclaracionesSAT.initGrids);
            //});

            // Helper.Test.readDeclaracion(function(dataDeclaracion) {
            //     AppDeclaracionesSAT.initGrids();

            //     cargarXmlDisco(dataDeclaracion, function(camposC26) {
            //         if (SAT.Environment.settings('dejarsinefecto') === true ||
            //             SAT.Environment.settings('actualizacionimporte') === true) {
            //            FormsBuilder.Runtime.initFormulario();

            //             $('#htmlOutput').find('[view-model]').attr("disabled", true);
            //             $('.btncollapse').attr("disabled", true);
            //             $('.panel').find('button.btnAddCtrlGridRow, button.btnDelCtrlGridRow').attr("disabled", true);
            //             $('button.btnAddFormularioGridRow, button.btnDelFormularioGridRow, button.btnCancelFormularioGridEdicionRow, button.btnSaveFormularioGridEdicionRow').attr("disabled", true);
            //         }

            //         if (SAT.Environment.settings('verificarfechapagoanterioridad') === true) {
            //             var isTemporal = false;// Establecer para emular dejarsinefecto/modificacionobligaciones nuevas o temporales
            //             habilitarCamposC26(camposC26, isTemporal);
            //         }

            //         console.log('Carga de XML');
            //    });
            // });

            //DeshabilitamosControles

            //if (!SAT.Environment.settings('isPresentacion')) {
            //    //$("[view-model], .sat-container-formgridedicion > button").attr("disabled", "disabled");
               

            //    $("#btnRegresarPms").show();
            //    $("#btnPresentarDeclaracion").show();
            //    $("#btnEnviarDeclara").hide();
            //    $("#btnGuardar").hide();

            //    $('#btnPresentarDeclaracion').on('click', function () {
            //        var declaracion = AppDeclaracionesSAT.getConfig('configuracionDeclaracion');
            //        var data = JSON.stringify(declaracion);
            //        window.location.href = '/Declaracion/Presentar/' + Base64.encode(data);
            //    });
            //    /*$("a[href='#tabDeterminacion']").click();
            //    $("#btn-acepta-propuesta, #btn-rechaza-propuesta").show();*/
            //}else
            //{
            //    $("#btnPresentarDeclaracion").hide();
            //    $("#btnRegresarPms").hide();
            //    $("#btnEnviarDeclara").show();
            //    $("#btnGuardar").show();
                
            //}

            var declaracion = AppDeclaracionesSAT.getConfig('configuracionDeclaracion');
            
            if (declaracion.esPrecarga == 'True') {
                $("#btnRegresarPms.btn.btn-primary.icon").show();
                $('#btnRegresarPms.btn.btn-primary.icon').on('click', FormsBuilder.ViewModel.bindRegresa);
            }
            else {
                $("#btnRegresarPms.btn.btn-primary.icon").hide();
            }

            var declaracion = AppDeclaracionesSAT.getConfig('configuracionDeclaracion');
            if (declaracion.OpcionCalculoISR == '-1') {
                $("#btnPresentarDeclaracion").hide();
                $("#btnEnviarDeclara").hide();
                $("#btnGuardar").hide();
            }
            else {
                $("#btnPresentarDeclaracion").show();
                $("#btnEnviarDeclara").hide();
                $("#btnGuardar").show();

                $('#btnPresentarDeclaracion').on('click', FormsBuilder.ViewModel.bindPresenta);
                $("#btnGuardar").on('click', FormsBuilder.ViewModel.bindGuardar);
            }

            if (SAT.Environment.settings('dejarsinefecto') === false && SAT.Environment.settings('actualizacionimporte') === false) {
                $('#htmlOutput').find('input[ForzarModoEdicion], select[ForzarModoEdicion]').attr("disabled", false);
            }

            if (SAT.Environment.settings('esquemaanterior') === true) {
                $('#myModal').modal('hide');
            }

            var operacion = {
                operacion: "OPCARGOPLT",
                parametros: {}
            };
            $('#DVOPER').html(JSON.stringify(operacion));

            if (AppDeclaracionesSAT.getConfig('readonly') === true) {
                console.log('Quitar elementos de navegación.');
                setTimeout(function () {
                    $('.guardardeclaracion, .btnEditFormularioGridEdicionRow, .btnDeleteFormularioGridEdicionRow, .btnDelCtrlGridRow, .btnAddCtrlGridRow, .calculoAmortizacion, .calculoinversion, .btnSaveFormularioGridEdicionRow, .btnCancelFormularioGridEdicionRow, .cargaMasivaRetenciones, .btnAddFormularioGridRow, .btnDelFormularioGridRow, .sat-button-dialog, #btnEnviarDeclara, #btnRevisionDeclara, #btnRegresaPerfil').addClass('hide');
                    $('input, select').attr('disabled', 'disabled');
                }, 4000);
            }

            console.log("all loaded!");
        };

        var initializingRuntime = function () {
            setTimeout(function () {
                FormsBuilder.Runtime.init(data.reglas, reading);
            }, 250);
        };
        
        var initializingUI = function () {
            setTimeout(function () {
                cargandoPaso(70);
                AppDeclaracionesSAT.initUIStepThree(initializingRuntime);
                //UPV quitando estilos despues de cargar controles y cargo eventos del boton
                remueveEstilosAsinc();
            }, 250);
        };

        // var rendering = function (domString) {
        //     $('#htmlOutput').html(domString);

        //     if (SAT.Environment.settings('dejarsinefecto') === true) {
        //         SAT.Environment.setSetting('applyrulesvalidation', false);
        //         $('#htmlOutput').find('[view-model]').attr("disabled", true);
        //     }

        //     FormsBuilder.ViewModel.applyDataBindings(initializingUI);
        // };

        // FormsBuilder.ViewModel.init(data.modeloDatos, 
        //   FormsBuilder.Parser.parseJson(data, rendering)          
        // );

        var binding = function () {
            setTimeout(function () {
                cargandoPaso(50);
                FormsBuilder.ViewModel.applyDataBindings(initializingUI);
            }, 250);
        };

        var rendering = function () {
            if (SAT.Environment.settings('dejarsinefecto') === true || SAT.Environment.settings('actualizacionimporte') === true) {
                SAT.Environment.setSetting('applyrulesvalidation', false);
                $('#htmlOutput').find('[view-model]').attr("disabled", true);
            }

            setTimeout(function () {
                cargandoPaso(30);
                FormsBuilder.ViewModel.init(data.modeloDatos, binding);
            }, 250);
        };

        setTimeout(function () {
            FormsBuilder.Parser.parseJson(data, rendering);
        }, 250);
    }


    function loadStepFour(data) {
        var operacion = {
            operacion: "OPCARGOPLT",
            parametros: {}
        };
        $('#DVOPER').html(JSON.stringify(operacion));

        if (AppDeclaracionesSAT.getConfig('readonly') === true) {
            console.log('Quitar elementos de navegación.');
            setTimeout(function () {
                $('#enviarDeclaracion, #btnEnviarDeclara').addClass('hide');
                $('input, select').attr('disabled', 'disabled');
            }, 1000);
        }
        console.log("all loaded!");
    }

    function esEntidadGeneral(tipo) {
        return $.inArray(tipo, ['SAT_DATOS_ACUSE', 'SAT_DATOS_CONTRIBUYENTE', 'SAT_DATOS_GENERALES']) >= 0 ? true : false;
    }

    function cargarXmlDisco(data, callback) {


        if (callback !== undefined &&
           AppDeclaracionesSAT.getConfig('tipodisco') === 'vigente' &&
           AppDeclaracionesSAT.getConfig('esSelector') === true) {
            console.log('Complementaria por selector');
            callback(camposC26);
            return;
        }
        
        //var xmlCopy = FormsBuilder.XMLForm.getCopy();
        FormsBuilder.XMLForm.copyDeclaracion(data);
        var entidadesXml = $(data).find('entidad');
        var entidadesJson = FormsBuilder.XMLForm.getEntidades();
        var controles = FormsBuilder.XMLForm.getControles();
        var viewModelDetalle = FormsBuilder.ViewModel.getDetalle();
        var idEntidad;
        var tipo;
        var propiedades;
        var camposC26 = {};

        //var navegacion = FormsBuilder.XMLForm.getNavegacion();
        //xmlCopy.find('navegacion > agrupador');
        // $.each(navegacion.agrupador, function (key, agrupador) {
        //     $.each(agrupador.seccion ,function (key, seccion) {
        //         var idEntidad = xmlCopy.find('diagramacion formulario controles').children('control[id="{0}"]'.format($(seccion).attr('idControlFormulario'))).attr('idEntidadPropiedad');
        //         FormsBuilder.ViewModel.getFlujoSecciones()[idEntidad]['NoVisible'] = false;
        //     });
        // });

        var keyEntidades = Enumerable.From(controles).Select("$.idEntidadPropiedad").ToArray();
        var newsEntities = FormsBuilder.ViewModel.getEntitiesXml(entidadesJson);

        //var controles = $(xmlCopy).find('formulario > controles').children('control');
        // $.each(controles, function (key, control) {
        //     keyEntidades.push($(control).attr('idEntidadPropiedad'));
        // });

        //$.each(keyEntidades, function (llave, entidadKey) {
        //    FormsBuilder.ViewModel.getFlujoSecciones()[entidadKey]['NoVisible'] = false;
        //});

        $.each(entidadesXml, function (k, v) {

            try {
                idEntidad = $(v).attr("id");

                var existeEntidad = true;
                if (!SAT.Environment.settings('isDAS')) {
                    if ((AppDeclaracionesSAT.getConfig('tipodisco') === 'vigente' ||
                        AppDeclaracionesSAT.getConfig('forma') === 'tmp') &&
                        $.inArray(idEntidad, newsEntities) === -1) {
                        console.log('No esta la entidad ', idEntidad);
                        existeEntidad = false;
                    }
                }

                if (existeEntidad === true) {
                    if (FormsBuilder.ViewModel.getFlujoSecciones()[idEntidad] !== undefined) {
                        FormsBuilder.ViewModel.getFlujoSecciones()[idEntidad]['NoAplica'] = $(v).attr("noaplica");
                        FormsBuilder.ViewModel.getFlujoSecciones()[idEntidad]['EntroSeccion'] = $(v).attr("entroseccion");
                        FormsBuilder.ViewModel.getFlujoSecciones()[idEntidad]['Visibilidad'] = $(v).attr("visibilidad");
                        FormsBuilder.ViewModel.getFlujoSecciones()[idEntidad]['OcultarMenuSeccion'] = $(v).attr("ocultarmenuseccion");
                    }
                    
                    var $entidadXml = Enumerable.From(entidadesJson).Where("$.id == '{0}'".format(idEntidad)).FirstOrDefault();
                    //mlCopy.find("modeloDatos entidad[id='{0}']".format(idEntidad));

                    if ($(v).find('fila').length > 0 && $(v).attr('grid') === undefined) {
                        //Setting Detalles
                        tipo = $(v).attr("tipo");
                        var esTipoCompensacionOrOtrosEstimulos = $.inArray(tipo, ["SAT_OTROS_ESTIMULOS", "SAT_COMPENSACIONES"]) >= 0;
                        if (SAT.Environment.settings('dejarsinefecto') === true && esTipoCompensacionOrOtrosEstimulos) {
                            return;
                        }
                        var filas = $(v).find('fila');
                        viewModelDetalle[idEntidad] = [];
                        $.each(filas, function (k, fila) {
                            var objItem = [];
                            propiedades = $(fila).find('propiedad');
                            $.each(propiedades, function (k, propiedad) {
                                var idPropiedad = $(propiedad).attr('id');
                                var value = $(propiedad).text();
                                var dataType = Enumerable.From($entidadXml.propiedades.propiedad).Where("$.id == '{0}'".format(idPropiedad)).Select("$.tipoDatos").FirstOrDefault();
                                //$entidadXml.find("propiedad[id='{0}']".format(idPropiedad)).attr("tipoDatos");
                                value = fbUtils.convertValue(value, dataType);
                                objItem.push({
                                    claveinformativa: $(propiedad).attr('claveinformativa'),
                                    propiedad: idPropiedad,
                                    valor: value,
                                    etiqueta: $(propiedad).attr('etiqueta')
                                });
                            });
                            viewModelDetalle[idEntidad].push(objItem);
                        });
                    } else if ($(v).attr('grid') === undefined) {
                        tipo = $(v).attr('tipo');
                        propiedades = $(v).find('propiedad');
                        $.each(propiedades, function (k, val) {
                            var idEntidadPropiedad = idEntidad;
                            var propiedad = $(val).attr("id");
                            var viewModelId = 'E{0}P{1}'.format(idEntidadPropiedad, propiedad);
                            var isDejarSinEfecto = SAT.Environment.settings('dejarsinefecto');
                            var isTotalAPagarId = viewModelId === AppDeclaracionesSAT.getConst("TotalAPagarViewModelId");

                            var value = $(val).text();
                            var dataType = Enumerable.From($entidadXml.propiedades.propiedad).Where("$.id == '{0}'".format(propiedad)).Select("$.tipoDatos").FirstOrDefault();
                            //$entidadXml.find("propiedad[id='{0}']".format(propiedad)).attr("tipoDatos");
                            if (dataType === undefined) {
                                var infoField = FormsBuilder.ViewModel.getFieldsForExprs()['${0}'.format(propiedad)];
                                dataType = infoField.tipoDatos;
                                viewModelId = "E{0}P{1}".format(infoField.entidad, infoField.propiedad);
                                idEntidadPropiedad = infoField.entidad;
                            }
                            var valueConverted = fbUtils.convertValue(value, dataType);
                            var claveInformativa = $(val).attr('claveinformativa');

                            if (isDejarSinEfecto && !esEntidadGeneral(tipo) && dataType !== "Booleano") {
                                //Cleaning Values
                                var indexMatch;
                                if (SAT.Environment.settings('isDAS')) {
                                    indexMatch = -2;
                                } else {
                                    indexMatch = $.inArray($(v).attr('id'), keyEntidades);
                                }
                                if (indexMatch !== -1) {
                                    if (value !== '') {
                                        if (dataType !== "Numerico") {
                                            FormsBuilder.ViewModel.get()[idEntidadPropiedad][viewModelId]('');
                                        }
                                        else {
                                            FormsBuilder.ViewModel.get()[idEntidadPropiedad][viewModelId](0);
                                        }
                                    }

                                    if (claveInformativa === "C26" || claveInformativa === "UC26" || claveInformativa == "C20" || claveInformativa == "C5") {
                                        if (!camposC26[claveInformativa]) {
                                            camposC26[claveInformativa] = {};
                                        }
                                        camposC26[claveInformativa][$(val).attr("id")] = valueConverted;
                                    }
                                } else {
                                    FormsBuilder.ViewModel.get()[idEntidadPropiedad][viewModelId](valueConverted);
                                }
                            } else {
                                //Setting Values
                                if (isTotalAPagarId && isDejarSinEfecto) {
                                    FormsBuilder.ViewModel.get()[idEntidadPropiedad][viewModelId](0);
                                } else {
                                    FormsBuilder.ViewModel.get()[idEntidadPropiedad][viewModelId](valueConverted);
                                }

                                if (claveInformativa === "C26" || claveInformativa === "UC26" || claveInformativa == "C20" || claveInformativa == "C5") {
                                    if (!camposC26[claveInformativa]) {
                                        camposC26[claveInformativa] = {};
                                    }
                                    camposC26[claveInformativa][$(val).attr("id")] = valueConverted;
                                }

                                if (esEntidadGeneral(tipo)) {
                                    symToVal("${0}".format(propiedad));
                                }
                            }
                            var $input = $('input[view-model="{0}"]'.format(viewModelId));

                            fbUtils.applyFormatCurrencyOnElement($input);
                        });
                    }

                    if ($(v).attr('pages') !== undefined && $(v).attr('numElements') !== undefined) {
                        if (SAT.Environment.settings('dejarsinefecto') === false) {
                            FormsBuilder.Modules.initMassive($(v).attr('pages'), $(v).attr('numElements'), idEntidad, {});
                            SAT.Environment.addtoArraySetting('massives', "A" + idEntidad + "001");
                        } else {
                            $(v).removeAttr(pages).removeAttr(numElements);
                        }
                    }
                }
            } catch (err) {
                console.log(err);
            }
        });

        AppDeclaracionesSAT.initStateForm();

        FormsBuilder.Runtime.runInitRules();

        if (SAT.Environment.settings('dejarsinefecto') === false && SAT.Environment.settings('actualizacionimporte') === false) {
            $('#htmlOutput').find('input[ForzarModoEdicion], select[ForzarModoEdicion]').attr("disabled", false);
        }

        var operacion = {
            operacion: "OPCARGODECLARACION",
            parametros: {}
        };
        $('#DVOPER').html(JSON.stringify(operacion));


        if (AppDeclaracionesSAT.getConfig('forma') === 'tmp') {
            var tiempo = (browser != 'chrome' && AppDeclaracionesSAT.getConfig('tipodisco') === 'vigente' ? 20 : 8) * 1000;

            if (AppDeclaracionesSAT.getConfig('tipodisco') === 'temporal') {
                AppDeclaracionesSAT.cargarClabesBancarias();
            }

            if (SAT.Environment.settings('isDAS')) {
                $('a.sat-button-dialog').attr('disabled', false);
            }

            setTimeout(function () {
                $('#myModal').modal('hide');
                if ((AppDeclaracionesSAT.getConfig('tipodisco') === 'vigente' ||
                    AppDeclaracionesSAT.getConfig('forma') === 'tmp') &&
                    SAT.Environment.settings('dejarsinefecto') === false) {
                    FormsBuilder.Runtime.runSubregimenesRules();
                    console.log('runSubregimenesRules');
                }
                if (!SAT.Environment.settings('isDAS')) {
                    FormsBuilder.Modules.actualizarModeloCargasMasivas();
                }
                if (AppDeclaracionesSAT.getConfig('esSelector') === true)
                    $('.topmenu li:last').click();
                else {
                    // $('.topmenu li:visible:first').click();

                    $('.submenu li').each(function (k, v) {
                        if ($(v).hasClass('hidden') === false) {
                            var idSubmenu = $(v).parents().eq(2).attr('idsubmenu');
                            var idTab = $('.tabsmenu a[idsubmenu="{0}"]'.format(idSubmenu)).parents().eq(1).attr('idtab');
                            $('.topmenu a[idTab="{0}"]'.format(idTab)).click();
                            return false;
                        }
                    });
                }

                if (SAT.Environment.settings('isDAS')) {
                    $('a.sat-button-dialog').attr('disabled', false);
                }
            }, tiempo);
        }

        if (callback !== undefined) callback(camposC26); -

        console.log("Termina CargaXmlDisco");
    }

   

    function obtenerCamposC26(data, callback) {
        //var xmlCopy = FormsBuilder.XMLForm.getCopy();
        FormsBuilder.XMLForm.copyDeclaracion(data);
        var entidades = $(data).find('entidad');
        var entidadesJson = FormsBuilder.XMLForm.getEntidades();
        var controlesJson = FormsBuilder.XMLForm.getControles();
        var viewModelDetalle = FormsBuilder.ViewModel.getDetalle();
        var idEntidad;
        var tipo;
        var propiedades;
        var camposC26 = {};

        //var navegacion = xmlCopy.find('diagramacion > navegacion > agrupador');
        //$.each(navegacion, function (key, agrupador) {
        //    $(agrupador).find('seccion').each(function (key, seccion) {
        //        var idEntidad = xmlCopy.find('diagramacion formulario controles').children('control[id="{0}"]'.format($(seccion).attr('idControlFormulario'))).attr('idEntidadPropiedad');
        //        FormsBuilder.ViewModel.getFlujoSecciones()[idEntidad]['NoVisible'] = false;
        //    });
        //});

        var keyEntidades = Enumerable.From(controlesJson).Select("$.idEntidadPropiedad").ToArray();
        var newsEntities = FormsBuilder.ViewModel.getEntitiesXml(entidadesJson);

        //var controles = FormsBuilder.XMLForm.getControles();
        //$(xmlCopy).find('formulario > controles').children('control');
        // $.each(controles, function (key, control) {
        //     keyEntidades.push(control.idEntidadPropiedad);
        // });

        $.each(entidades, function (k, v) {
            try {
                idEntidad = $(v).attr("id");

                var existeEntidad = true;
                if (AppDeclaracionesSAT.getConfig('tipodisco') === 'vigente' &&
                    $.inArray(idEntidad, newsEntities) === -1) {
                    console.log('No esta la entidad ', idEntidad);
                    existeEntidad = false;
                }

                if (existeEntidad === true) {

                    var $entidadXml = Enumerable.From(entidadesJson).Where("$.id == '{0}'".format(idEntidad)).FirstOrDefault();
                    //xmlCopy.find("modeloDatos entidad[id='{0}']".format(idEntidad));

                    if ($(v).find('fila').length > 0 && $(v).attr('grid') === undefined) {
                        //Setting Detalles
                        tipo = $(v).attr("tipo");
                        var esTipoCompensacionOrOtrosEstimulos = $.inArray(tipo, ["SAT_OTROS_ESTIMULOS", "SAT_COMPENSACIONES"]) >= 0;
                        if (SAT.Environment.settings('dejarsinefecto') === true && esTipoCompensacionOrOtrosEstimulos) {
                            return;
                        }
                        var filas = $(v).find('fila');

                    } else if ($(v).attr('grid') === undefined) {
                        tipo = $(v).attr('tipo');
                        propiedades = $(v).find('propiedad');
                        $.each(propiedades, function (k, val) {
                            var propiedad = $(val).attr("id");
                            var viewModelId = 'E{0}P{1}'.format(idEntidad, propiedad);
                            var isDejarSinEfecto = SAT.Environment.settings('dejarsinefecto');
                            var isTotalAPagarId = viewModelId === AppDeclaracionesSAT.getConst("TotalAPagarViewModelId");

                            var value = $(val).text();
                            var dataType = Enumerable.From($entidadXml.propiedades.propiedad).Where("$.id == '{0}'".format(propiedad)).Select("$.tipoDatos").FirstOrDefault();
                            //$entidadXml.find("propiedad[id='{0}']".format(propiedad)).attr("tipoDatos");
                            var valueConverted = fbUtils.convertValue(value, dataType);
                            var claveInformativa = $(val).attr('claveinformativa');
                            if (isDejarSinEfecto && !esEntidadGeneral(tipo) && dataType !== "Booleano") {
                                //Cleaning Values
                                var indexMatch = $.inArray($(v).attr('id'), keyEntidades);
                                if (indexMatch !== -1) {


                                    if (claveInformativa === "C26" || claveInformativa === "UC26" || claveInformativa == "C20" || claveInformativa == "C5") {
                                        if (!camposC26[claveInformativa]) {
                                            camposC26[claveInformativa] = {};
                                        }
                                        camposC26[claveInformativa][$(val).attr("id")] = valueConverted;

                                    }

                                } else {
                                    //FormsBuilder.ViewModel.get()[idEntidad][viewModelId](valueConverted);
                                }
                            } else {


                                if (claveInformativa === "C26" || claveInformativa === "UC26" || claveInformativa == "C20" || claveInformativa == "C5") {
                                    if (!camposC26[claveInformativa]) {
                                        camposC26[claveInformativa] = {};
                                    }
                                    camposC26[claveInformativa][$(val).attr("id")] = valueConverted;

                                }


                            }


                        });
                    }


                }
            } catch (err) {
                console.log(err);
            }
        });

        if (callback !== undefined) callback(camposC26);
    }


    function habilitarCamposC26(campos, isTemporal) {
        //var xmlCopy = FormsBuilder.XMLForm.getCopy();
        var UC26 = "UC26";
        var C26 = "C26";
        var C20 = "C20";
        var C5 = "C5";
        var isModificacionObligaciones = AppDeclaracionesSAT.getConfig('tipocomplementaria') === AppDeclaracionesSAT.getConst('TipoComplementariaModificacionObligaciones');
        var isDejarSinEfecto = AppDeclaracionesSAT.getConfig('tipocomplementaria') === AppDeclaracionesSAT.getConst('TipoComplementariaDejarSinEfecto');
        var entidadesJson = FormsBuilder.XMLForm.getEntidades();

        var getViewModelId = function (idEntidad, claveInformativa) {
            var viewModelId = '';            
            var entidadJson = Enumerable.From(entidadesJson).Where("$.id == '{0}'".format(idEntidad)).FirstOrDefault();            
            var $propiedadNode = Enumerable.From(entidadJson.propiedades.propiedad).Where("$.claveInformativa == '{0}'".format(claveInformativa)).FirstOrDefault();
            //xmlCopy.find("entidad[id='{0}'] propiedades propiedad[claveInformativa='{1}']".format(idEntidad, claveInformativa)).eq(0);
            if ($propiedadNode) {
                var idPropiedad = $propiedadNode.id;
                viewModelId = "E{0}P{1}".format(idEntidad, idPropiedad);
            }
            return viewModelId;
        };

        if (isDejarSinEfecto) {
            $(".topay > span:last").html("$0");
        }

        if (isTemporal) {
            var propiedadesUc26 = Enumerable.From(entidadesJson).SelectMany("$.propiedades.propiedad").Where("$.claveInformativa == '{0}'".format(UC26)).ToArray();
            //xmlCopy.find("propiedades propiedad[claveInformativa='{0}']".format(UC26));
            $.each(propiedadesUc26, function (k, v) {
                var propiedadesC26 = Enumerable.From(entidadesJson).SelectMany("$.propiedades.propiedad").Where("$.claveInformativa == '{0}'".format(C26)).ToArray();
                var attributoActivarConSaldoFavor = Enumerable.From(propiedadesC26).SelectMany("$.atributos.atributo").Where("$.nombre === 'ActivarConSaldoAFavor'").Select("$.valor").FirstOrDefault();
                //$(v).parent().find("propiedad[claveInformativa='{0}'] atributos atributo[nombre='ActivarConSaldoAFavor']".format(C26)).attr("valor");
                var idPropiedad = v.id;
                var valueUc26 = 0;
                if (campos[UC26] !== undefined) {
                    valueUc26 = campos[UC26][idPropiedad] || 0;
                }
                var dbIdUc26;
                var dbIdC20;
                var dbIdC5;

                if (IsNullOrEmpty(valueUc26)) valueUc26 = 0;
                if (!ESNUMERO(valueUc26)) valueUc26 = 0;

                var infoProp = FormsBuilder.ViewModel.getFieldsForExprs()['${0}'.format(idPropiedad)];

                if (infoProp) {
                    dbIdC20 = getViewModelId(infoProp.entidad, C20);
                    dbIdC5 = getViewModelId(infoProp.entidad, C5);

                    var valueC20 = '';
                    if (campos[C20] !== undefined) {
                        valueC20 = campos[C20][fbUtils.getPropiedad(dbIdC20)] || '';
                    }
                    var valueC5 = '';
                    if (campos[C5] !== undefined) {
                        valueC5 = campos[C5][fbUtils.getPropiedad(dbIdC5)] || '';
                    }
                    FormsBuilder.ViewModel.get()[fbUtils.getEntidad(dbIdC20)][dbIdC20](valueC20);
                    FormsBuilder.ViewModel.get()[fbUtils.getEntidad(dbIdC5)][dbIdC5](valueC5);
                    FormsBuilder.ViewModel.applyRulesDejarSinEfecto(dbIdC20);
                    FormsBuilder.ViewModel.applyRulesDejarSinEfecto(dbIdC5);

                    if (valueUc26 > 0) {
                        if (isDejarSinEfecto) {
                            dbIdUc26 = getViewModelId(infoProp.entidad, UC26);
                            FormsBuilder.ViewModel.get()[fbUtils.getEntidad(dbIdUc26)][dbIdUc26](valueUc26);
                        }

                        $("#htmlOutput input[view-model={0}]".format(attributoActivarConSaldoFavor)).removeAttr("disabled");
                        MOSTRAR('$' + fbUtils.getPropiedad(attributoActivarConSaldoFavor))();
                        var valueDate = FECHA(valueC5);
                        var isInvalidDate = valueDate === fbUtils.getDateMin();
                        if (!isInvalidDate) {
                            MOSTRAR('$' + fbUtils.getPropiedad(dbIdC20))();
                            $("#htmlOutput input[view-model={0}]".format(dbIdC20)).removeAttr("disabled");
                            fbUtils.applyFormatCurrencyOnElement($("#htmlOutput input[view-model={0}]".format(dbIdC20)), true);
                        }
                    }
                }
            });
        } else {
            //Nueva Forma
            var propiedadesC26 = Enumerable.From(entidadesJson).SelectMany("$.propiedades.propiedad").Where("$.claveInformativa == '{0}'".format(C26)).ToArray();
            //xmlCopy.find("propiedades propiedad[claveInformativa='{0}']".format(C26));
            $.each(propiedadesC26, function (k, v) {

                var attributoActivarConSaldoFavor = Enumerable.From(v.atributos.atributo).Where("$.nombre === 'ActivarConSaldoAFavor'").Select("$.valor").FirstOrDefault();
                //$(v).find("atributos atributo[nombre='ActivarConSaldoAFavor']").attr("valor");
                var idPropiedad = v.id;
                var valueC26 = 0;
                if (campos[C26] !== undefined) {
                    valueC26 = campos[C26][idPropiedad] || 0;
                }
                var dbIdUc26;
                var dbIdC20;
                var dbIdC5;

                var infoProp = FormsBuilder.ViewModel.getFieldsForExprs()['${0}'.format(idPropiedad)];
                var valueC20 = '';
                var valueC5 = '';

                if (infoProp) {
                    dbIdUc26 = getViewModelId(infoProp.entidad, UC26);
                    dbIdC5 = getViewModelId(infoProp.entidad, C5);
                    dbIdC20 = getViewModelId(infoProp.entidad, C20);
                    FormsBuilder.ViewModel.get()[fbUtils.getEntidad(dbIdUc26)][dbIdUc26](0);

                    if (isModificacionObligaciones || isDejarSinEfecto) {
                        if (campos[C20] !== undefined) {
                            valueC20 = campos[C20][fbUtils.getPropiedad(dbIdC20)] || '';
                        }
                        if (campos[C5] !== undefined) {
                            valueC5 = campos[C5][fbUtils.getPropiedad(dbIdC5)] || '';
                        }
                        FormsBuilder.ViewModel.get()[fbUtils.getEntidad(dbIdC20)][dbIdC20](valueC20);
                        FormsBuilder.ViewModel.get()[fbUtils.getEntidad(dbIdC5)][dbIdC5](valueC5);
                        FormsBuilder.ViewModel.applyRulesDejarSinEfecto(dbIdC5);
                        FormsBuilder.ViewModel.applyRulesDejarSinEfecto(dbIdC20);
                    }

                    if (IsNullOrEmpty(valueC26)) valueC26 = 0;
                    if (!ESNUMERO(valueC26)) valueC26 = 0;

                    if (valueC26 > 0) {
                        FormsBuilder.ViewModel.get()[fbUtils.getEntidad(dbIdUc26)][dbIdUc26](valueC26);
                        $("#htmlOutput input[view-model={0}]".format(attributoActivarConSaldoFavor)).removeAttr("disabled");
                        MOSTRAR('$' + fbUtils.getPropiedad(attributoActivarConSaldoFavor))();

                        var valueDate = FECHA(valueC5);
                        var isInvalidDate = valueDate === fbUtils.getDateMin();
                        if (!isInvalidDate) {
                            MOSTRAR('$' + fbUtils.getPropiedad(dbIdC20))();
                            $("#htmlOutput input[view-model={0}]".format(dbIdC20)).removeAttr("disabled");
                            fbUtils.applyFormatCurrencyOnElement($("#htmlOutput input[view-model={0}]".format(dbIdC20)), true);
                        }
                    }

                    if (valueC20 > 0) {
                        fbUtils.applyFormatCurrencyOnElement($("#htmlOutput input[view-model={0}]".format(dbIdC20)), true);
                    }
                }
            });
        }
    }

    function aplicarReglasC26() {
        //var xmlCopy = FormsBuilder.XMLForm.getCopy();
        var entidadesJson = FormsBuilder.XMLForm.getEntidades();
        var UC26 = "UC26";
        var C20 = "C20";
        var C5 = "C5";

        var getViewModelId = function (idEntidad, claveInformativa) {
            var viewModelId = '';
            var entidadJson = Enumerable.From(entidadesJson).Where("$.id == '{0}'".format(idEntidad)).FirstOrDefault();
            var $propiedadNode = Enumerable.From(entidadJson.propiedades.propiedad).Where("$.claveInformativa == '{0}'".format(claveInformativa)).FirstOrDefault();
            //xmlCopy.find("entidad[id='{0}'] propiedades propiedad[claveInformativa='{1}']".format(idEntidad, claveInformativa)).eq(0);
            if ($propiedadNode) {
                var idPropiedad = $propiedadNode.id;
                viewModelId = "E{0}P{1}".format(idEntidad, idPropiedad);
            }
            return viewModelId;
        };

        var propiedadesUc26 = Enumerable.From(entidadesJson).SelectMany("$.propiedades.propiedad").Where("$.claveInformativa == '{0}'".format(UC26)).ToArray();
        //xmlCopy.find("propiedades propiedad[claveInformativa='{0}']".format(UC26));
        $.each(propiedadesUc26, function (k, v) {
            var idPropiedad = v.id;

            var dbIdC20;
            var dbIdC5;

            var infoProp = FormsBuilder.ViewModel.getFieldsForExprs()['${0}'.format(idPropiedad)];

            if (infoProp) {
                dbIdC20 = getViewModelId(infoProp.entidad, C20);
                dbIdC5 = getViewModelId(infoProp.entidad, C5);

                FormsBuilder.ViewModel.applyRulesDejarSinEfecto(dbIdC20);
                FormsBuilder.ViewModel.applyRulesDejarSinEfecto(dbIdC5);
            }

        });
    }

    function precargaAnexoPersonaFisica(callback) {
        if (SAT.Environment.settings('loadedPrecargarAnexo') === true) { callback(); return };
        if (AppDeclaracionesSAT.getConfig('forma') === 'new' &&
            ((AppDeclaracionesSAT.getConfig('tipodeclaracion') === AppDeclaracionesSAT.getConst('TipoDeclaracionNormal') ||
            AppDeclaracionesSAT.getConfig('tipodeclaracion') === AppDeclaracionesSAT.getConst('TipoDeclaracionNormalCorrecionFiscal')) ||
            AppDeclaracionesSAT.getConfig('esSelector') === true &&
            AppDeclaracionesSAT.getConfig('tipodeclaracion') === AppDeclaracionesSAT.getConst('TipoDeclaracionComplementaria') ||
             AppDeclaracionesSAT.getConfig('esSelector') === true &&
            AppDeclaracionesSAT.getConfig('tipodeclaracion') === AppDeclaracionesSAT.getConst('TipoDeclaracionComplementariaCorrecionFiscal') ||
             AppDeclaracionesSAT.getConfig('esSelector') === true &&
            AppDeclaracionesSAT.getConfig('tipodeclaracion') === AppDeclaracionesSAT.getConst('TipoDeclaracionComplementariaDictamen')
            )) {
            console.log('precargaAnexoPersonaFisica');
            SAT.Environment.setSetting('isHydrate', true);

            var data = $.parseXML(Base64.decode($('#DVDAPREFOR').html())) || FormsBuilder.XMLForm.getCopyPrecarga();
            data = preprocesarPrecargaAnexoPersonaFisica($(data));

            var datosAnexoPersonaFisica = $(data).find('DatosAnexoPersonaFisica').find('[idEntidad]');
            //var xmlFormulario = FormsBuilder.XMLForm.getCopy();            
            var grid = [];

            $.each(datosAnexoPersonaFisica, function (key, datoFisica) {

                var entidad = $(datoFisica).attr('idEntidad');                

                if (SAT.Environment.settings('isDAS')) {
                    if (FormsBuilder.ViewModel.getFlujoSecciones()[entidad] === undefined) {
                        FormsBuilder.ViewModel.getFlujoSecciones()[entidad] = {};
                        FormsBuilder.ViewModel.getFlujoSecciones()[entidad]['NoVisible'] = false;
                    }
                }

                if (FormsBuilder.ViewModel.getFlujoSecciones()[entidad] !== undefined) {
                    var isVisible = FormsBuilder.ViewModel.getFlujoSecciones()[entidad]['NoVisible'];

                    if (isVisible === false || isVisible === undefined) {
                        var entidades = FormsBuilder.XMLForm.getEntidades();
                        var panelContenedor = $('#htmlOutput .panel[identidadpropiedad="{0}"]'.format(entidad));
                        var boton = panelContenedor.find('.btnAddFormularioGridRow');
                        boton = (boton.length > 0) ? boton : panelContenedor.find('.btnAddCtrlGridRow:first');
                        if (boton.length > 0) {
                            var cantidadentidades = $(data).find('DatosAnexoPersonaFisica').find('[idEntidad="{0}"]'.format(entidad)).length;
                            var renglones = FormsBuilder.ViewModel.getDetalleGrid()[entidad];
                            if ((!$.isArray(renglones) || renglones.length === 0)) {
                                boton.click();
                            }

                            var clavesInformativas = $(datoFisica).find('[claveInformativa]');                            
                            $.each(clavesInformativas, function (key, claveInformativa) {
                                var entidadModelDatos = Enumerable.From(entidades).Where("$.id == '{0}'".format(entidad)).FirstOrDefault();
                                var propiedadModeloDatos = entidadModelDatos.propiedades 
                                    ? Enumerable.From(entidadModelDatos.propiedades.propiedad).Where("$.claveInformativa == '{0}'".format($(claveInformativa).attr('claveInformativa'))).FirstOrDefault() 
                                    : {"id": ""}; 
                                //xmlFormulario.find('entidad[id="{0}"]'.format(entidad)).find('[claveInformativa="{0}"]'.format($(claveInformativa).attr('claveInformativa'))).attr('id');
                                var db_id = "E{0}P{1}".format(entidad, propiedadModeloDatos.id);

                                var grid = FormsBuilder.ViewModel.getDetalleGrid()[entidad];
                                var ultimoRenglon = grid[grid.length - 1];

                                var noRedondear = $(claveInformativa).attr('noRedondear');
                                for (var columna in ultimoRenglon) {
                                    if (columna.split('_')[0] === db_id) {
                                        var valor = $(claveInformativa).text();
                                        if (valor.match(/[.]/igm) !== null && noRedondear != 1) {
                                            valor = REDONDEARSAT(valor);
                                        }
                                        if (valor != 'false') {
                                            grid[grid.length - 1][columna](valor);
                                            if ($('input[view-model="{0}"]'.format(columna)).hasClass('currency')) {
                                                fbUtils.applyFormatCurrencyOnElement($('input[view-model="{0}"]'.format(columna)), true);
                                            }
                                        }
                                    }
                                }
                            });

                            renglones = FormsBuilder.ViewModel.getDetalleGrid()[entidad];

                            var botonSalvar = boton.parent().find('button.btnSaveFormularioGridEdicionRow:first');
                            if (botonSalvar.length > 0) {
                                $.when(botonSalvar.click()).done(function () {
                                    // Verificacion
                                });
                            } else {
                                if (renglones.length < cantidadentidades) {
                                    boton.click();
                                }
                            }

                        } else if (panelContenedor.find('.sat-container-formgridedicion .btnAddItem:first').length > 0) {
                            boton = panelContenedor.find('.sat-container-formgridedicion .btnAddItem:first');

                            //var cantidadentidades = $(data).find('DatosAnexoPersonaFisica').find('[idEntidad="{0}"]'.format(entidad)).length;
                            //var renglones = FormsBuilder.ViewModel.getDetalleGrid()[entidad];
                            var detalleGrid = FormsBuilder.ViewModel.getDetalleGrid();

                            if (!detalleGrid[entidad]) {
                                detalleGrid[entidad] = [];
                            }

                            grid = detalleGrid[entidad];

                            var clavesInformativas = $(datoFisica).find('[claveInformativa]');
                            var gridViewModel = {};
                            var entidadModelDatos = Enumerable.From(entidades).Where("$.id == '{0}'".format(entidad)).FirstOrDefault();

                            $.each(clavesInformativas, function (key, claveInformativa) {                                
                                var propiedadModeloDatos = entidadModelDatos.propiedades 
                                    ? Enumerable.From(entidadModelDatos.propiedades.propiedad).Where("$.claveInformativa == '{0}'".format($(claveInformativa).attr('claveInformativa'))).FirstOrDefault() 
                                    : {"id": ""};

                                var db_id = "E{0}P{1}".format(entidad, propiedadModeloDatos.id);
                                
                                //var ultimoRenglon = grid[grid.length - 1];

                                var noRedondear = $(claveInformativa).attr('noRedondear');                                
                                var valor = $(claveInformativa).text();
                                // console.log(valor, claveInformativa);139878
                                if (valor.match(/[.]/igm) !== null && noRedondear != 1) {
                                    valor = REDONDEARSAT(valor);
                                }

                                if (valor === undefined) {
                                    valor = $(claveInformativa).text();
                                }
                                // console.log(valor, claveInformativa);

                                if (valor != 'false') {
                                    gridViewModel[db_id] = valor === 'true' ? valor.ToBoolean() : valor;
                                    if ($('input[view-model="{0}"]'.format(db_id)).hasClass('currency')) {
                                        fbUtils.applyFormatCurrencyOnElement($('input[view-model="{0}"]'.format(db_id)), true);
                                    }
                                }

                                
                            });

                            grid.push(gridViewModel);
                            FormsBuilder.Modules.pintarFilasGrid(entidad);
                            //renglones = FormsBuilder.ViewModel.getDetalleGrid()[entidad];                            

                            //var botonSalvar = boton.parent().find('button.btnSaveFormularioGridEdicionRow:first');
                            //if (botonSalvar.length > 0) {
                            //    $.when(botonSalvar.click()).done(function () {
                            //        boton.click();
                            //    });
                            //}
                        } else {
                            if ($(datoFisica).children().length > 0) {
                                var childs = $(datoFisica).find('[claveInformativa]');
                                $.each(childs, function (key, child) {
                                    
                                    var db_id = "E{0}P{1}".format(entidad, $(child).attr('claveInformativa'));
                                    var noRedondear = $(child).attr('noRedondear');
                                    var valor = $(child).text();
                                    if (valor.match(/[.]/igm) !== null && noRedondear != 1) {
                                        valor = REDONDEARSAT(valor);
                                    }
                                    if (valor != 'false') {
                                        var entidadViewModel = FormsBuilder.ViewModel.get()[entidad];
                                        if (entidadViewModel && typeof entidadViewModel !== 'undefined') {
                                            entidadViewModel[db_id](valor);
                                            if ($('input[view-model="{0}"]'.format(db_id)).hasClass('currency')) {
                                                fbUtils.applyFormatCurrencyOnElement($('input[view-model="{0}"]'.format(db_id)), true);
                                            }
                                        }
                                        // if (SAT.Environment.settings('isDAS')) {
                                        //     if (typeof FormsBuilder.ViewModel.get()[entidad] !== 'undefined') {
                                        //         FormsBuilder.ViewModel.get()[entidad][db_id](valor);
                                        //         if ($('input[view-model="{0}"]'.format(db_id)).hasClass('currency')) {
                                        //             fbUtils.applyFormatCurrencyOnElement($('input[view-model="{0}"]'.format(db_id)), true);
                                        //         }
                                        //     }
                                        // } else {
                                        //     FormsBuilder.ViewModel.get()[entidad][db_id](valor);
                                        //     if ($('input[view-model="{0}"]'.format(db_id)).hasClass('currency')) {
                                        //         fbUtils.applyFormatCurrencyOnElement($('input[view-model="{0}"]'.format(db_id)), true);
                                        //     }
                                        // }
                                    }
                                });
                            } else {
                                var childs = $(datoFisica).attr('claveInformativa');
                                if (childs != undefined) {
                                    var db_id = "E{0}P{1}".format(entidad, $(datoFisica).attr('claveInformativa'));
                                    var valor = $(datoFisica).text();
                                    if (valor.match(/[.]/igm) !== null) {
                                        valor = REDONDEARSAT(valor);
                                    }
                                    if (valor != 'false') {
                                        FormsBuilder.ViewModel.get()[entidad][db_id](valor);
                                        if ($('input[view-model="{0}"]'.format(db_id)).hasClass('currency')) {
                                            fbUtils.applyFormatCurrencyOnElement($('input[view-model="{0}"]'.format(db_id)), true);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                if (SAT.Environment.settings('isDAS')) {
                    if (FormsBuilder.ViewModel.getFlujoSecciones()[entidad] !== undefined) {
                        FormsBuilder.ViewModel.getFlujoSecciones()[entidad] = undefined;
                    }

                    if (AppDeclaracionesSAT.getConfig('esSelector')) {
                        setTimeout(function () {
                            SAT.Environment.setSetting('isHydrate', false);
                        }, 1000);
                    }
                }
            });            
        }
        SAT.Environment.setSetting('loadedPrecargarAnexo', true);
        callback();
    }

    function precargaInformacion(data, callback) {
        console.log('precarga normal');

        if (data == null || data == undefined) {
            return;
        }

        FormsBuilder.XMLForm.copyPrecarga(data);

        /**Carga valores iniciales**/

        var listaValoresIniciales = [];
        var valoresIniciales = $(data).find('DatosIniciales').children('*').not('DatosAnexoPersonaFisica');


        $.each(valoresIniciales, function (k, v) {
            if ($(v).children().length > 0) {
                var childs = $(v).children('[claveInformativa]');
                $.each(childs, function (key, child) {
                    listaValoresIniciales.push(child);
                });
            } else {
                if ($(v).attr('claveInformativa') !== undefined) {
                    listaValoresIniciales.push(v);
                }
            }
        });

        $.each(listaValoresIniciales, function (key, valor) {
            var campoCarga = FormsBuilder.ViewModel.getFieldsForExprs()["$" + $(valor).attr('claveInformativa')];
            if (campoCarga !== undefined) {
                var db_id = "E{0}P{1}".format(campoCarga.entidad, campoCarga.propiedad);
                FormsBuilder.ViewModel.get()[(db_id.split('P')[0]).replace('E', '')][db_id]($(valor).text());
            }
        });

        /**Termina carga de valores iniciales**/




        FormsBuilder.Runtime.runInitRules();

        AppDeclaracionesSAT.setConfig("deshabilitarDialogos", true);

        if (SAT.Environment.settings('dejarsinefecto') === false && SAT.Environment.settings('actualizacionimporte') === false) {
            $('#htmlOutput').find('input[ForzarModoEdicion], select[ForzarModoEdicion]').attr("disabled", false);
        }

        var listValores = [];
        var valores = $(data).find('DatosContribuyente').children('*').not('DatosAnexoPersonaFisica');
        var nodosIdentidadContribuyente = $(data).find('DatosContribuyente').find("IdentidadContribuyente").children('*');


        $.each(valores, function (k, v) {
            if ($(v).children().length > 0) {
                var childs = $(v).children('[claveInformativa]');
                $.each(childs, function (key, child) {
                    listValores.push(child);
                });
            } else {
                if ($(v).attr('claveInformativa') !== undefined) {
                    listValores.push(v);
                }
            }
        });

        $.each(listValores, function (key, valor) {
            var rule = FormsBuilder.ViewModel.getFieldsForExprs()["$" + $(valor).attr('claveInformativa')];
            if (rule !== undefined) {
                var db_id = "E{0}P{1}".format(rule.entidad, rule.propiedad);
                FormsBuilder.ViewModel.get()[(db_id.split('P')[0]).replace('E', '')][db_id]($(valor).text());
            }
        });

        $.each(nodosIdentidadContribuyente, function (key, nodo) {
            var claveInformativa = nodo.tagName.replace("SAT_", "");
            var llave = FormsBuilder.ViewModel.getFieldsForExprs()["$" + claveInformativa];
            if (llave) {
                var db_id = "E{0}P{1}".format(llave.entidad, llave.propiedad);
                FormsBuilder.ViewModel.get()[llave.entidad][db_id]($(nodo).text());
            }
        });

        if (callback && typeof (callback) == "function") {
            callback();
        }

        var entidadNoVisible = [];
        var subRegimenSugerido = [];

        if (AppDeclaracionesSAT.getConfig('forma') === 'new' &&
            ((AppDeclaracionesSAT.getConfig('tipodeclaracion') === AppDeclaracionesSAT.getConst('TipoDeclaracionNormal') ||
                    AppDeclaracionesSAT.getConfig('tipodeclaracion') === AppDeclaracionesSAT.getConst('TipoDeclaracionNormalCorrecionFiscal')) ||
                AppDeclaracionesSAT.getConfig('esSelector') === true &&
                AppDeclaracionesSAT.getConfig('tipodeclaracion') === AppDeclaracionesSAT.getConst('TipoDeclaracionComplementaria') ||
                AppDeclaracionesSAT.getConfig('esSelector') === true &&
                AppDeclaracionesSAT.getConfig('tipodeclaracion') === AppDeclaracionesSAT.getConst('TipoDeclaracionComplementariaCorrecionFiscal') ||
                AppDeclaracionesSAT.getConfig('esSelector') === true &&
                AppDeclaracionesSAT.getConfig('tipodeclaracion') === AppDeclaracionesSAT.getConst('TipoDeclaracionComplementariaDictamen')
            )) {

            var datosAnexoSubRegimenSugerido = $(data).find('DatosGenerales').find('Regimenes');
            $.each(datosAnexoSubRegimenSugerido, function (key, subRegimen) {
                var idSubRegimen = $(subRegimen).find('Regimen').find('ClaveRegimen').text();
                subRegimenSugerido.push(idSubRegimen);
            });

            var datosAnexoPersonaFisica = $(data).find('DatosAnexoPersonaFisica').find('[idEntidad]');
            //var controles = FormsBuilder.XMLForm.getControles();
            //var navegacion = FormsBuilder.XMLForm.getNavegacion();
            //var xmlFormulario = FormsBuilder.XMLForm.getCopy();

            /*$.each(datosAnexoPersonaFisica, function (key, datoFisica) {
                var entidad = $(datoFisica).attr('idEntidad');

                var controlEntidad = Enumerable.From(controles).Where("$.idEntidadPropiedad == '{0}'".format(entidad)).FirstOrDefault(); //xmlFormulario.find('formulario').children('controles').children('[idEntidadPropiedad="{0}"]'.format(entidad)).attr('id');

                var idSubregimen = Enumerable.From(navegacion.agrupador).Where("$.") //xmlFormulario.find('agrupador').find('[idControlFormulario="{0}"]'.format(controlEntidad)).parent().attr('idSubRegimen');

                if (idSubregimen != undefined) {
                    if (entidadNoVisible.indexOf(idSubregimen) === -1) {
                        entidadNoVisible.push(idSubregimen);
                    }
                }
            });*/
        }

        if (tipoPersona === 'F') {
            /*var xmlCopy = FormsBuilder.XMLForm.getCopy();
            var navegacion = xmlCopy.find('navegacion > agrupador');
            $.each(navegacion, function (key, agrupador) {
                $(agrupador).find('seccion').each(function (key, seccion) {
                    var idEntidad = xmlCopy.find('diagramacion formulario controles').children('control[id="{0}"]'.format($(seccion).attr('idControlFormulario'))).attr('idEntidadPropiedad');
                    FormsBuilder.ViewModel.getFlujoSecciones()[idEntidad]['NoVisible'] = false;
                });
            });*/

            if (datosAnexoPersonaFisica !== undefined && datosAnexoPersonaFisica.length > 0) {
                if (AppDeclaracionesSAT.getConfig('esSelector') === true) {
                    setTimeout(function () {
                        AppDeclaracionesSAT.precargaAnexoPersonaFisica(function () {

                            if (AppDeclaracionesSAT.getConfig('forma') === 'new' &&
                                (AppDeclaracionesSAT.getConfig('tipodeclaracion') === AppDeclaracionesSAT.getConst('TipoDeclaracionNormalCorrecionFiscal') ||
                                    AppDeclaracionesSAT.getConfig('esSelector') === true &&
                                    AppDeclaracionesSAT.getConfig('tipodeclaracion') === AppDeclaracionesSAT.getConst('TipoDeclaracionComplementaria') ||
                                    AppDeclaracionesSAT.getConfig('esSelector') === true &&
                                    AppDeclaracionesSAT.getConfig('tipodeclaracion') === AppDeclaracionesSAT.getConst('TipoDeclaracionComplementariaCorrecionFiscal') ||
                                    AppDeclaracionesSAT.getConfig('esSelector') === true &&
                                    AppDeclaracionesSAT.getConfig('tipodeclaracion') === AppDeclaracionesSAT.getConst('TipoDeclaracionComplementariaDictamen')
                                )) {
                                obtenerCamposC26(FormsBuilder.ViewModel.createXml(), function (camposC26) {
                                    habilitarCamposC26(camposC26, false);
                                    setTimeout(function () {
                                        // Se agregó el click en la ruta selector.
                                        $('.topmenu li:last').click();
                                        $('#myModal').modal('hide');
                                        AppDeclaracionesSAT.setConfig("deshabilitarDialogos", false);
                                    }, 250);
                                });
                            } else {
                                setTimeout(function () {
                                    // Se agregó el click en la ruta selector.
                                    $('.topmenu li:last').click();
                                    $('#myModal').modal('hide');
                                    AppDeclaracionesSAT.setConfig("deshabilitarDialogos", false);
                                }, 250);
                            }
                        });
                    }, 1000);
                } else {
                    $('#modalAvisoPreCarga').modal('show');
                    AppDeclaracionesSAT.setConfig("deshabilitarDialogos", false);
                }
            } else {
                if (parseInt(FormsBuilder.XMLForm.getCopyPrecarga().find('[claveInformativa="57"]').text()) === 1 && AppDeclaracionesSAT.getConfig('esSelector') !== true) {
                    $('#modalAvisoNoPreCarga').modal('show');
                }

                AppDeclaracionesSAT.setConfig("deshabilitarDialogos", false);
            }

            setTimeout(function () {
                if (AppDeclaracionesSAT.getConfig('esSelector') === true)
                    $('.topmenu li:last').click();
                else {
                    // $('.topmenu li:visible:first').click();
                    $('.submenu li').each(function (k, v) {
                        if ($(v).hasClass('hidden') === false) {
                            var idSubmenu = $(v).parents().eq(2).attr('idsubmenu');
                            var idTab = $('.tabsmenu a[idsubmenu="{0}"]'.format(idSubmenu)).parents().eq(1).attr('idtab');
                            $('.topmenu a[idTab="{0}"]'.format(idTab)).click();
                            return false;
                        }
                    });
                }

                setTimeout(function () {
                    $('#myModal').modal('hide');
                }, 100);
            }, 250);
        }

        fbUtils.applyFormatCurrencyOnElement($("#htmlOutput"), true);

        //if (IsNullOrEmptyOrZero(document.referrer) === false) {
        //    if (document.referrer.split('/')[4].split('?')[0] == 'StepPerfil'
        //        || document.referrer.split('/')[4].split('?')[0] == 'Install') {
        //        reiniciaSession();
        //        $('.submenu li').each(function (k, v) {
        //            if ($(v).hasClass('hidden') === false) {
        //                var idSubmenu = $(v).parents().eq(2).attr('idsubmenu');
        //                var idTab = $('.tabsmenu a[idsubmenu="{0}"]'.format(idSubmenu)).parents().eq(1).attr('idtab');
        //                $('.topmenu a[idTab="{0}"]'.format(idTab)).click();
        //                return false;
        //            }
        //        });
        //    }
        //}
    }

    function precargaInformacionComplementaria(data, callback) {
        console.log('precarga complementaria');
        if (SAT.Environment.settings('dejarsinefecto') === false && SAT.Environment.settings('actualizacionimporte') === false) {
            $('#htmlOutput').find('input[ForzarModoEdicion], select[ForzarModoEdicion]').attr("disabled", false);
        }

        if (callback && typeof (callback) == "function") {
            callback();
        }

        var listValores = [];
        var valores = $(data).find('DatosContribuyente').children('*').not('DatosAnexoPersonaFisica');
        var nodosIdentidadContribuyente = $(data).find('DatosContribuyente').find("IdentidadContribuyente").children('*');

        $.each(valores, function (k, v) {
            if ($(v).children().length > 0) {
                var childs = $(v).children('[claveInformativa]');
                $.each(childs, function (key, child) {
                    listValores.push(child);
                });
            } else {
                if ($(v).attr('claveInformativa') !== undefined) {
                    listValores.push(v);
                }
            }
        });

        $.each(listValores, function (key, valor) {
            var rule = FormsBuilder.ViewModel.getFieldsForExprs()["$" + $(valor).attr('claveInformativa')];
            if (rule !== undefined) {
                var db_id = "E{0}P{1}".format(rule.entidad, rule.propiedad);
                FormsBuilder.ViewModel.get()[(db_id.split('P')[0]).replace('E', '')][db_id]($(valor).text());
            }
        });

        $.each(nodosIdentidadContribuyente, function (key, nodo) {
            var claveInformativa = nodo.tagName.replace("SAT_", "");
            var llave = FormsBuilder.ViewModel.getFieldsForExprs()["$" + claveInformativa];
            if (llave) {
                var db_id = "E{0}P{1}".format(llave.entidad, llave.propiedad);
                FormsBuilder.ViewModel.get()[llave.entidad][db_id]($(nodo).text());
            }
        });

        //Se quita condición para que reejecute siempre
        //if (AppDeclaracionesSAT.getConfig('tipocomplementaria') === AppDeclaracionesSAT.getConst('TipoComplementariaDejarSinEfecto')) {
        aplicarReglasC26();
        //}

        fbUtils.applyFormatCurrencyOnElement($("#htmlOutput"), true);
    }

    function cargandoPaso(progreso) {
        $('.progress-bar').attr('aria-valuenow', progreso);
        $('.progress-bar').attr('style', 'width:' + progreso + '%;');
    }

    function preprocesarPrecargaAnexoPersonaFisica(precarga, callback) {

        var CLAVE_ARRENDAMIENTO = "B1";
        var CLAVE_PROFESIONAL = "A1";

        var totalRetencionesIntereses = 0,
            totalIngresosAnexo2 = { valor: 0, "entidad": "1089", "clave": "AEP1" },
            totalExencionesAnexo2 = { valor: 0, "entidad": "1089", "clave": "AEP2" },
            totalIngresosArrendaAnexo2 = { valor: 0, "entidad": "1010", "clave": "ARR2" },
            totalExencionesArrendaAnexo2 = { valor: 0, "entidad": "1010", "clave": "ARR3" };

        var retencionesIntereses = precarga.find("DatosAnexoPersonaFisica DatosRetencionInteres InteresNominalTot");

        retencionesIntereses.each(function (k, v) {
            totalRetencionesIntereses += REDONDEARSAT(parseFloat(IsNullOrEmpty($(v).text()) ? 0 : $(v).text()));
        });

        if (precarga.find("DatosAnexoPersonaFisica Intereses > MontoInteres").length > 0 && totalRetencionesIntereses > 0) {
            $(precarga.find("DatosAnexoPersonaFisica Intereses > MontoInteres")[0]).text(totalRetencionesIntereses);
        }

        var montos = precarga.find("DatosAnexoPersonaFisica Anexo2 DatosAnexo2");

        montos.each(function (k, v) {

            var montoOperacionGravada = REDONDEARSAT(parseFloat(IsNullOrEmpty($(v).find("MontoOperacionGravada").text()) ? 0 : $(v).find("MontoOperacionGravada").text()));
            var montoExentoIsr = REDONDEARSAT(parseFloat(IsNullOrEmpty($(v).find("MontoExentoIsr").text()) ? 0 : $(v).find("MontoExentoIsr").text()));

            var sumaMontos = montoOperacionGravada + montoExentoIsr;
            $(v).find("MontoIngresosPagados").text(sumaMontos);

            var montoIngresosPagados = REDONDEARSAT(parseFloat(IsNullOrEmpty($(v).find("MontoIngresosPagados").text()) ? 0 : $(v).find("MontoIngresosPagados").text()));

            if ($(v).find("ClavePago").text() === CLAVE_ARRENDAMIENTO) {
                totalIngresosArrendaAnexo2.valor += montoOperacionGravada;
                totalExencionesArrendaAnexo2.valor += montoExentoIsr;

                $(precarga).find("DatosAnexoPersonaFisica TotalIngresosArrendaAnexo2").text(totalIngresosArrendaAnexo2.valor > 0 ? totalIngresosArrendaAnexo2.valor : "");
                $(precarga).find("DatosAnexoPersonaFisica TotalExencionesArrendaAnexo2").text(totalExencionesArrendaAnexo2.valor > 0 ? totalExencionesArrendaAnexo2.valor : "");
            }
            else if ($(v).find("ClavePago").text() === CLAVE_PROFESIONAL) {
                totalIngresosAnexo2.valor += montoIngresosPagados;
                totalExencionesAnexo2.valor += montoExentoIsr;

                $(precarga).find("DatosAnexoPersonaFisica TotalIngresosAnexo2").text(totalIngresosAnexo2.valor > 0 ? totalIngresosAnexo2.valor : "");
                $(precarga).find("DatosAnexoPersonaFisica TotalExencionesAnexo2").text(totalExencionesAnexo2.valor > 0 ? totalExencionesAnexo2.valor : "");
            }
        });

        return precarga;
    }

})();
