"use strict";

(function () {
    namespace("Service.Test",
        obtenerPlantilla, recibeDeclaracion, //obtenerCadenaOriginal,
        recibeDeclaracionFirmada, EnviaPago,
         almacenarDeclaracionTemporalDas, 
         obtenerCadenaOriginalFirma, IngresarConfiguracionDeclaracion);

    var tiempoesperaconfiguracion = 20000;
    var tiempoesperaplantilla =135000;
    var tiempoesperaguardado = 30000;
    var configDeclaracionFirmado;
    var montoDeclaracionFirmado = '';

    function IngresarConfiguracionDeclaracion(configuracion, monto) {
        configDeclaracionFirmado = configuracion;
        montoDeclaracionFirmado = monto;
        console.log('Ingreso -> montoDeclaracionFirmado', montoDeclaracionFirmado);
    }


    /* Obtiene la plantilla - Paso 3 y 4*/
    function obtenerPlantilla() {
        try {
           
            var declaracion = AppDeclaracionesSAT.getConfig('configuracionDeclaracion');

            
            console.log(declaracion);
           
            var data = JSON.stringify(declaracion);

            var form = $('#__AjaxAntiForgeryForm');
            var token = $('input[name="__RequestVerificationToken"]', form).val();
            
            $("#DVINFODECLA").html(Base64.encode(data));

            $.ajax({
                type: "POST",
                url: "/Declaracion/ObtenerPlantilla",
                data: {
                    __RequestVerificationToken: token,
                    data: data
                },
                async: true,
                success: function (result) {

                    if (!result.EsValido) {
                        var url = window.location.origin;

                        try
                        {
                            if ($.trim(result.Mensaje) == '')
                                result.Mensaje = Base64.decode(result.Xml[0]);
                        } 
                        catch (err)
                        { console.log(err); }
                        openDialogDirect(result.Mensaje, "Cerrar", url);
                       
                    } else {
                        xmlResultado = {
                          
                            preCarga: result.Xml[0],
                            temporal: result.Xml[1],
                            complementaria: result.Xml[2],
                            forma: result.Formulario,
                            escomplementaria: result.Xml[2].length > 0,
                            obligaciones: result.Xml[9]
                        };

                        var xmlPlantilla = {
                            modeloDatos: JSON.parse(result.Xml[3]),
                            diagramacion: JSON.parse(result.Xml[4]),
                            navegacion: JSON.parse(result.Xml[5]),
                            reglas: JSON.parse(result.Xml[6]),
                            catalogos: result.Xml[7],
                            ayudas: JSON.parse(result.Xml[8])
                        }

                        console.log(xmlPlantilla.diagramacion);                       
                        declaracion.OpcionCalculoISR = result.Xml[9] == '0' ? '' : declaracion.OpcionCalculoISR;
                        var origen = xmlResultado.length > 0 ? 'disco' : 'servicio';
                        var tipodisco = xmlResultado.escomplementaria ? 'vigente' : 'temporal';

                        var config = {};
                        config.iddeclaracion = declaracion.NoDeclaracion;
                        config.tipocomplementaria = '0';
                        config.tipocomplementariadesc = '0';
                        config.noreforma = declaracion.NoReforma;
                        config.obligaciones = declaracion.obligaciones;
                        config.presentaDeclaracion = declaracion.presentaDeclaracion;
                        config.OpcionCalculoISR = declaracion.OpcionCalculoISR;

                        var valores = $($.parseXML(Base64.decode(result.Xml[0]))).find('IdentidadContribuyente').children('*');
                        if (valores && valores.length > 0) {
                            $.map(valores, function (a, b) {
                                switch (a.tagName) {
                                    case 'SAT_FISCAL_PERIOD': config.periodo = a.textContent; break;
                                    case 'SAT_DECLARATN_TYPE': config.tipodeclaracion = a.textContent; break;
                                    case 'SAT_FISCAL_YEAR': config.ejercicio = a.textContent; break;
                                    case 'DESCR1': config.periododesc = a.textContent; break;
                                    case 'DESCR2': config.periodicidaddesc = a.textContent; break;
                                    case 'SAT_DESCR_DECLARATN_TYPE': config.tipodeclaraciondesc = a.textContent; break;
                                    case 'DURATION_FREQ': config.periodicidad = a.textContent; break;
                                    case 'SAT_DECLAR_CATEG': config.tipocomplementaria = a.textContent; break;
                                    case 'SAT_HABIL_PRECARGA': config.esPrecarga = a.textContent; break;
                                }
                            });

                            AppDeclaracionesSAT.setConfig('configuracionDeclaracion', config);
                        }
                        // Datos de configuracion
                        var infoContribuyente = {
                            nombre: result.Contribuyente.NombreCompleto,
                            rfc: result.Contribuyente.Rfc,
                            ejercicio: config.ejercicio,
                            origen: origen,
                            tipocomplementariatexto: config.tipocomplementariadesc,
                            tipodeclaraciontexto: config.tipodeclaraciondesc,
                            tipodeclaracion: config.tipodeclaracion,
                            tipocomplementaria: config.tipocomplementaria,
                            tipopersona: result.Contribuyente.TipoContribuyente,
                            forma: result.Formulario,
                            periodotexto: config.periododesc,
                            tipodisco: tipodisco
                        };
                       
                        $('#DVINFOCON').html(JSON.stringify(infoContribuyente));
                        // cargamos la plantilla
                        console.log('plantilla');

                        AppDeclaracionesSAT.loadStepThree(xmlPlantilla);
                        //$('#DVDECLARACIONDISCO').html(xmlResultado.temporal);
                        //$('#DVPLANFOR').html('LOAD');
                       
                    }
                },
                timeout: tiempoesperaplantilla,
                error: function (jqXHR, textStatus, errorThrown) {
                    console.log('JSON.obtenerPlantilla: ', jqXHR.responseText, 'textStatus', textStatus);
                    $('#DVOPER').html(JSON.stringify({
                        operacion: "OPSENDFORM"
                    }));
                    if (textStatus === "timeout") {
                        var queryString = document.location.search.substr(1);
                        var url = window.location.pathname.toLowerCase();
                        openDialogDirect("El servidor excedió el tiempo de respuesta.", "Reintentar", (url.indexOf('stepfour') > 0 ? "/Declaracion/StepFour?" : "/Declaracion/StepThree?") + queryString);
                    } else {
                        //location.href = '/';
                        openDialogDirect("Problemas con la conexión. Revise su conexión a Internet.", "Cerrar", "/");
                    }
                }
            });
        } catch (err) {
            console.log('JSON.obtenerPlantilla: ' + err);
           
                openDialogDirect("Se perdió la conexión.", "Cerrar", "/Perfil/Temporales");
           
        }
    }

    

    /* Guarda la Declaración Temporal para flujo DAS - [Paso : 3] */
    function almacenarDeclaracionTemporalDas(esRedireccion, urlRedireccion) {

        var continuarConAlmacenado = true;
        var contieneErrores=false

        if (FormsBuilder.Utils.hasAllQueueRules() === true || SAT.Environment.settings('isHydrate') === true) {
            continuarConAlmacenado = false;

        }

       
            //$('span.badge').each(function (k, v) {
            //    if (parseInt($(v).html()) > 0) {
            //        $('#modalErroresEnSecciones').modal('show');
            //        contieneErrores = true;
            //    }
            //});
        

        if (continuarConAlmacenado) {
            $('#modalGuardando').modal('show');
            //:: Codificado de declaración
            var xml = FormsBuilder.ViewModel.createXml();
            var token = $('input[name="__RequestVerificationToken"]', $('#__AjaxAntiForgeryForm')).val();
            var declaracion = AppDeclaracionesSAT.getConfig('configuracionDeclaracion');
            declaracion.errores = AppDeclaracionesSAT.validaErroresSecciones();
            declaracion.xmldeclaracion = Base64.encode(xml);

            //:: Envio de declaracion

            $.ajax({
                type: "POST",
                url: "/Declaracion/AlmacenarDeclaracionTemporal",
                data: { __RequestVerificationToken: token, data: JSON.stringify(declaracion) },
                async: false,
                success: function (resultado) {
                    $('#modalGuardando').modal('hide');
                    /*var totalPagar = utils.model.findProppertyId(xml, '24007');
                    var optoPorDevolucion = utils.model.findProppertyId(xml, '205192');
                    var saldoAFavor = utils.model.findProppertyId(xml, '111024');
                    */
                    if (resultado.EsValido) {
                        SAT.Environment.setSetting('isModified', false);

                        if (esRedireccion === true) {
                             if ($('i.icon-warning-sign').length > 0) {
                            openDialogError("Proceso concluído, se detectaron errores en la declaración.");
                            }
                            else {
                                location.href = urlRedireccion +resultado.Mensaje;
                            }                            
                        }                       
                    }
                    else {
                        
                        openDialogError("Ocurrió un error al enviar la información. Intente nuevamente.");
                    }
                },
                error: function (jqXHR, textStatus, errorThrown) {
                    reiniciaSession();
                     $('#modalGuardando').modal('hide');
                    if (textStatus === "timeout") openDialogError("El servidor excedió el tiempo de respuesta, la sección no fue almacenada. Inténtelo nuevamente.", "Cerrar");
                    else openDialogError("Problemas con la conexión. Revise su conexión a Internet.");
                }
            });

        }        

    }

    /* Enviamos la declaración sin firmar y esperamos el acuse de recibo */
    function recibeDeclaracion() {
        try {
            reloj(false);
            $('#modalEnvioDeclaracion').modal('show');
            var idDeclaracion = configDeclaracionFirmado;
            var form = $('#__AjaxAntiForgeryForm');
            var token = $('input[name="__RequestVerificationToken"]', form).val();

            console.log('Enviando declaracion no firmada');

            $.ajax({
                type: "POST",
                url: "/Declaracion/RecibeDeclaracion",
                data: {
                    __RequestVerificationToken: token,
                    data: idDeclaracion
                },
                success: function (result) {
                    console.log(result);
                    $('#modalEnvioDeclaracion').modal('hide');
                    $('.modal-backdrop').hide();
                    var operacion = {
                        operacion: "OPSENDFORM",
                        parametros: {}
                    };
                    $('#DVOPER').html(JSON.stringify(operacion));

                    if (!result.EsValido) {
                        openDialog(result.Mensaje, "Cerrar");
                    } else {
                        console.log("Genera Acuse");
                        generaAcuse(result.Archivo);

                    }
                },
                error: function (jqXHR, textStatus, errorThrown) {
                    //reloj(false);
                    $('.modal-backdrop').hide();
                    console.log('JSON.recibeDeclaracion: ' + jqXHR.statusText);
                    openDialog("Problemas con la conexión. Revise su conexión a Internet.", "Cerrar");
                }
            });
        } catch (err) {
            console.log(err);
            openDialog("Se perdió la conexión.", "Cerrar");
        }
    }
    function recibeDeclaracionFirmada(objetoFirma) {
        try {
            reloj(0);
            $('#modalEnvioDeclaracion').modal('show');

            var declaracion = {};
            declaracion.firma = objetoFirma.firmaDigital;
            declaracion.numeroCertificado = objetoFirma.cadenaOriginalGenerada.split('|')[3];
            declaracion.folioStampCertificado = objetoFirma.cadenaOriginalGenerada;
            declaracion.idDeclaracion = configDeclaracionFirmado;

            console.log('Enviando declaracion firmada...');

            var form = $('#__AjaxAntiForgeryForm');
            var token = $('input[name="__RequestVerificationToken"]', form).val();
            $.ajax({
                type: "POST",
                url: "/Declaracion/RecibeDeclaracionFirmada",
                async: true,
                data: {
                    __RequestVerificationToken: token,
                    data: JSON.stringify(declaracion)
                },
                success: function (result) {
                    $('#modalEnvioDeclaracion').modal('hide');
                    if (!result.EsValido) {
                        $('#modalDialog').find('.modal-msg').html(result.Mensaje);
                        $('#modalDialog').find('.si').html("Cerrar").live('click', function () {
                            $('#modalDialog').modal('hide');
                        });
                        $('#modalDialog').modal({ backdrop: 'static', keyboard: false });
                    } else {
                        $('.finalizar-declaracion').show();
                        //$('#titulo-vista-revision-acuse').html('&nbsp;Acuse de recibo');
                        generaAcuse(result.Archivo);
                        //generaPagos(result.Mensaje);
                        if (SAT.Environment.settings('isMobile')) {
                            $('#row-message-for-DAS').show();
                        }
                    }
                },
                error: function (jqXHR, textStatus, errorThrown) {
                    console.log('JSON.recibeDeclaracionFirmada: ' + jqXHR.statusText);
                    openDialog("Problemas con la conexión. Revise su conexión a Internet.", "Cerrar");
                }
            });
        } catch (err) {
            console.log('JSON.recibeDeclaracionFirmada: ' + err);
            openDialog("Se perdió la conexión.", "Cerrar", "/");
        }
    }

    function generaPagos(_lineaCaptura) {
        //RFC, monto, linea de captura, tipopersona
        console.log('montoDeclaracionFirmado', montoDeclaracionFirmado);
        var monto = utils.url.getPageName().toLowerCase() === 'stepsign' ? montoDeclaracionFirmado : (utils.queryString.toJSON().totalpagar + '');
        if (_lineaCaptura.length <= 0) return;
        if (SAT.Environment.settings('isMobile')) {
            $('#htmlOutput').hide();
            $('#footer-pagos').hide();
            $('.descargar-bancos').hide();
        } else {
            //:: Solicita lista de bancos
            $.ajax({
                url: "/Declaracion/GetRequestByBank",
                type: 'GET',
                data: {
                    monto: Number(monto.replace(/[^0-9\.]+/g, "")),
                    lineacaptura: _lineaCaptura.replace(/ /g, '')
                },
                success: function (results) {
                    console.log('listando bancos');
                    var form = '<tr>';
                    var i = 0;
                    $.each(results, function (t, y) {
                        var url = y.URL;
                        var fields = y.fields;
                        var img = y.IMAGE;
                        if (i === 5) { form += '</tr><tr>'; i = 0; }
                        form += '<td style="padding: 10px;cursor: pointer;"><img src="' + img + '" width="80" height="40"  onclick="Service.Test.EnviaPago(\'' + url + '\',\'' + fields + '\');"/></td>';
                        i++;
                    });
                    form += '</tr>';
                    $("#Pagos-Bancos").append(form);
                },
                error: function (xhr, status, error) {
                    console.log('JSON.generaPagos: ' + xhr.statusText);
                    openDialog("Problemas con la conexión. Revise su conexión a Internet.", "Cerrar");
                }
            });

            $('#htmlOutput').show();
            $('#row-message-for-DAS').hide();
            $('.descargar-bancos').attr('style', 'visibility:visible; display:block;');
            $('#footer-pagos').attr('style', 'visibility:visible; display:block;');
        }
    }

    function generaAcuse(uriBlob) {
        console.log("Generando de acuse");
        uriBlob = uriBlob.replace('&', '%26');
        var urlAcuse = '/GeneraArchivo/GeneraArchivoAcuse?enLinea=' + (SAT.Environment.settings('isMobile') ? 0 : 1) + '&uriBlob=' + uriBlob;
        //var pago = obtieneUrlPago();

        //$('#modalDialogPdf .cerrar').on('click', function () {
        //    $('#modalDialogPdf').modal('hide');
        //    reloj(1);
        //    parent.location.href = '/';
        //});
        $('.descargar-acuse').on('click', function () {
            window.open(SAT.Environment.settings('isMobile') ? urlAcuse : urlAcuse.replace('enLinea=1', 'enLinea=0'), '_blank');
        });
        //$('.descargar-bancos').on('click', function () {
        //    document.location.href = "#div-bancos";

        //});
        //$('.finalizar-declaracion').on('click', function () {
        //    document.location.href = "/";
        //});
        //$('#modalDialogPdf .pagar').on('click', function () {
        //    var ventana = window.open(pago, '_blank', 'location=0,menubar=0,toolbar=0', true);
        //});

        if (SAT.Environment.settings('isMobile')) {
            window.setTimeout(function () {
                $('.descargar-acuse').trigger('click');
            }, 100);
        } else {
            var $iframe = $('<iframe>', {
                id: 'iframeMorales',
                frameborder: 0,
                height: '98%',
                //'class': 'col-xs-12 col-sm-10 col-md-10 col-lg-10  col-sm-offset-2 col-md-offset-2 col-lg-offset-2',
                'class': 'col-xs-12 col-sm-10 col-md-10 col-lg-10  col-sm-offset-1 col-md-offset-1 col-lg-offset-1',
                scrolling: 'no',
                src: urlAcuse
            });
            $('#htmlOutput').html($iframe);
            window.setTimeout(function () {
                $('#myModal').modal('hide');
                if (typeof callback === 'function') callback();
            }, 800);
        }

        $('.row-form').show();
        $('#firmado-widget-container').hide();
        $('#htmlOutput').attr('style', 'position: relative; z-index: 1; width: 100%; height: 100%; margin-top: 15px; margin-bottom:15px;')
        $('#tituloSeccion').html('<span class="icon icon-edit marg-R1em type-primary"></span> Acuse de recibo');
        $('#enviarDeclaracion').attr('style', 'visibility:hidden; display:none;');
        $('#editarDeclaracion').attr('style', 'visibility:hidden; display:none;');
        $('#regresarRevision').attr('style', 'visibility:hidden; display:none;');
        $('.descargar-acuse').attr('style', 'visibility:visible; display:block;');
    }


    function EnviaPago(url, fields) {
        var form = document.createElement("form");
        form.setAttribute("method", "post");
        form.setAttribute("action", url);
        form.setAttribute("target", "_blank");

        $.each(fields.split("&"), function (k, v) {
            var id = v.split("=")[0];
            var value = v.split("=")[1];
            if (value !== undefined) {
                var hiddenField = document.createElement("input");
                hiddenField.setAttribute("type", "hidden");
                hiddenField.setAttribute("name", id);
                hiddenField.setAttribute("value", value);
                form.appendChild(hiddenField);
                console.log(hiddenField);
            }
        });


        document.body.appendChild(form);    // Not entirely sure if this is necessary
        form.submit();
    }

    function CloseModal() {
        alert('a');
    }

    function obtenerCadenaOriginalFirma(funcionLlamada) {
        try {
            var declaracion = { idDeclaracion: configDeclaracionFirmado };
            $.ajax({
                type: "POST",
                url: "/Declaracion/ObtenerCadenaOriginal",
                data: { data: JSON.stringify(declaracion) },
                async: true,
                success: function (result) {
                    if (result.EsValido) {
                        if (typeof funcionLlamada === 'function') funcionLlamada(result.Archivo);
                    } else {
                        reloj(false);
                        openDialog(result.Mensaje, "Cerrar");
                    }
                },
                error: function (jqXHR, textStatus, errorThrown) {
                    reloj(false);
                    console.log('JSON.obtenerCadenaOriginal: ' + jqXHR.statusText);
                    openDialog("Problemas con la conexión. Revise su conexión a Internet.", "Cerrar");
                }
            });
        } catch (err) {
            reloj(false);
            console.log('JSON.obtenerCadenaOriginal: ' + err);
            openDialog("Se perdió la conexión.", "Cerrar");
        }
    }




   
    

})();