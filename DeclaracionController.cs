namespace SAT.DeclaracionesAnuales2014.Portal.Controllers
{
    #region using

    using System;
    using System.Collections.Generic;
    using System.IO;
    using System.Text;
    using System.Threading.Tasks;
    using System.Web;
    using System.Web.Mvc;
    using System.Xml;
    using System.Xml.Linq;
    using System.Linq;
    using Newtonsoft.Json;
    using Newtonsoft.Json.Linq;

    using Sat.DeclaracionesAnuales.Entidad.Enumeracion;
    using Sat.DeclaracionesAnuales.Entidad.Seguridad;
    using Sat.DyP.Herramientas.Configuracion;
    using Sat.DyP.Herramientas.Logger;
    using Sat.DeclaracionesAnuales.Portal.Negocio.Declaraciones;
    using Sat.DeclaracionesAnuales.Descarga;

    using SAT.DeclaracionesAnuales.Portal.Negocio.Herramientas;
    using SAT.DeclaracionesAnuales.Portal.Negocio.Pagos;


    using SAT.DeclaracionesAnuales2014.Portal.ViewModels;
    using System.Collections.Specialized;
    using Sat.DeclaracionesAnuales.Entidad.Azure;

    using SAT.DeclaracionesAnuales2014.Portal.Helpers;
    using Sat.DyP.Herramientas.Recurso;
    using Sat.DyP.Clasificador.Entidades.Azure;
    using Sat.DyP.Clasificador.Negocio;
    using Sat.DyP.Consumo.Catalogos;
    using Sat.DyP.Herramientas.Menu;
    #endregion

    /// <summary>
    /// Controlador utilizado para el manejo de los metodos de la generación de una declaración
    /// </summary>
    public class DeclaracionController : Controller
    {
        private const string TEMP_DATA_ENCABEZADO = "Encabezado";
        public ActionResult VistaPrevia(string id)
        {
            ActionResult vista = this.View(RecursoClasificador.ParcialErrorEnPermisos);
            var encabezado = new EncabezadoDypClasificador();

            try
            {
                ContribuyenteInfo contribuyente = this.ContribuyenteAutenticado();

                if (!string.IsNullOrEmpty(id) && this.PeticionDesdeLugarReferido() && contribuyente.Espms)
                {
                    vista = RedirectToAction("Abrir", new { id });
                }
            }
            catch (Exception ex)
            {
                RegistroEvento.Error(ref ex, CodigoEvento.ErrorNegocio, RecursoClasificador.ErrorEnAutenticacion, null, null, origen: RecursoClasificador.ClasificadorOrigen);
            }
            TempData[TEMP_DATA_ENCABEZADO] = encabezado;
            return vista;
        }

        public ActionResult Presentar(string id)
        {
            ContribuyenteInfo contribuyente = this.ContribuyenteAutenticado();

            if (!string.IsNullOrEmpty(id))
            {
                id = Utileria.Instancia.DeCodificarBase64(id);
                dynamic parametro = JsonConvert.DeserializeObject(id);
                var declaracion = new DeclaracionClasificador()
                {
                    Ejercicio = parametro.ejercicio,
                    Periodo = parametro.periodo,
                    Rfc = contribuyente.Rfc
                };

                var declaracionalmacenada = declaracion.DeclaracionAlmacenadaNoEnviada();

                return this.Redirect(string.Format("{0}/{1}?EsPMS={2}",
                                                    ConfiguracionApp.AdaptadorCloud.RecuperarCadena("UrlPortalDyP"),
                                                    ConfiguracionApp.AdaptadorCloud.RecuperarCadena("UrlPresentarDeclaracionDyP"), // "Paginas/ConfigDeclaracion.aspx",
                                                    declaracionalmacenada.EncriptadosParaDyP()));
            }

            return View();
        }
        
        public ActionResult PresentaDeclaracion(string id)
        {
            ActionResult vista = this.View(RecursoClasificador.ParcialErrorEnPermisos);
            try
            {
                ContribuyenteInfo contribuyente = this.ContribuyenteAutenticado();

                if (!string.IsNullOrEmpty(id) && this.PeticionDesdeLugarReferido() && contribuyente.Espms)
                {
                    string strMensaje = "";
                    id = new Sat.DyP.Herramientas.Encripcion.Encripcion().DesencriptaCadena(id, Sat.DyP.Herramientas.Encripcion.TipoEncripcion.Base64URL);
                    this.ViewBag.idDeclaracion = id;
                    this.ViewBag.RFC = Utileria.Instancia.CodificarBase64(contribuyente.Rfc);

                    vista = this.View();

                    using (var declaracion = new Declaracion())
                    {
                        ViewBag.Devolucion = declaracion.obtieneMontoDevolucion(contribuyente.Rfc, id, out strMensaje);
                    }
                }
            }
            catch (Exception ex)
            {
                RegistroEvento.Error(ref ex, CodigoEvento.ErrorNegocio, RecursoClasificador.ErrorEnAutenticacion, null, null, origen: RecursoClasificador.ClasificadorOrigen);
            }

            return vista;
        }

        public ActionResult AbrirEmpleado(string id)
        {
            ActionResult vista = this.View(RecursoClasificador.ParcialErrorEnPermisos);
            var declaracion = new DeclaracionClasificador();

            string limpio = string.Empty;
            try
            {
                if (ConfiguracionApp.AdaptadorCloud.RecuperarBoolean("IsPortalEmpleado"))
                {
                    var empleado = this.ObtieneInfoEmpleado();
                    var encriptador = new Sat.DyP.Herramientas.Encripcion.Encripcion();
                    var datosEntrada = encriptador.DesencriptaCadena(id, Sat.DyP.Herramientas.Encripcion.TipoEncripcion.Base64URL);

                    if (!string.IsNullOrEmpty(datosEntrada))
                    {
                        var configs = datosEntrada.Split(',').Where(x => x.Contains("re:")).FirstOrDefault();
                        var rfcContribuyente = datosEntrada.Split(',').Where(x => x.Contains("r:")).FirstOrDefault();
                        var rfcEmpleado = string.Empty;
                        if (!string.IsNullOrEmpty(configs))
                        {
                            rfcEmpleado = configs.Replace("re:", string.Empty);
                            rfcContribuyente = !string.IsNullOrEmpty(rfcContribuyente) ? rfcContribuyente.Replace("r:", string.Empty) : rfcEmpleado;
                            // Llamada desde empleado
                            if (rfcEmpleado == empleado.Rfc)
                            {


                                bool contribuyenteValido = this.ObtieneInfoContribuyenteEmpleado(rfcContribuyente);
                                if (contribuyenteValido)
                                {
                                    ContribuyenteInfo contribuyente = MemberCache.Instancia.UsuarioActual;
                                    if (!string.IsNullOrEmpty(id) && contribuyente.Espms)
                                    {
                                        declaracion = DeclaracionClasificadorComplementos.ObtenerDeclaracionDedeUrl(id);
                                        var declaracionTemporal = declaracion.ActualizarDeclaracionPorAbrirDeclaracion();

                                        if (contribuyente.Rfc == declaracion.Rfc)
                                        {
                                            var idencriptado = declaracionTemporal.CodigoDeterminacionEncirptado(string.Empty);
                                            vista = Redirect(string.Format(RecursoClasificador.UrlDeterminacion, idencriptado));
                                        }
                                        else
                                        {
                                            var ex = new Exception("Rfc no es el mismo");
                                            RegistroEvento.Error(ref ex, CodigoEvento.ErrorNegocio, RecursoClasificador.ErrorEnAutenticacion,
                                                limpio, null, origen: System.Reflection.MethodBase.GetCurrentMethod().Name);
                                        }
                                    }
                                    else
                                    {
                                        var ex = new Exception("Intento entrar");
                                        RegistroEvento.Error(ref ex, CodigoEvento.ErrorNegocio, RecursoClasificador.ErrorEnAutenticacion, limpio, null, origen: System.Reflection.MethodBase.GetCurrentMethod().Name);
                                    }

                                }
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                RegistroEvento.Error(ref ex, CodigoEvento.ErrorNegocio, RecursoClasificador.ErrorEnAutenticacion, null, null, origen: System.Reflection.MethodBase.GetCurrentMethod().Name);
            }

            return vista;
        }

        #region Public Methods and Operators

        /// <summary>
        /// Almacena la declaración de manera temporal en las tablas de azure al momento de cambiar de sección,
        /// al validad o dar clic al botón guardar
        /// </summary>
        /// <param name="data">
        /// JSON con los valores de configuración
        /// </param>
        /// <returns>
        /// The <see cref="ActionResult"/>.
        /// </returns>
        [HttpPost]
        [ValidateInput(false)]
        [ValidateAntiForgeryToken]
        public ActionResult AlmacenarDeclaracionTemporal(string data = "")
        {
            ResultadoViewModel resultado = new ResultadoViewModel();
            ContribuyenteInfo contribuyente = this.ContribuyenteAutenticado();
            try
            {
                if (!string.IsNullOrEmpty(data))
                {
                    dynamic parametro = Newtonsoft.Json.JsonConvert.DeserializeObject(data);
                    string xmldeclaracion = parametro.xmldeclaracion;
                    string rfc = contribuyente.Rfc;
                    string idDeclaracion = parametro.iddeclaracion;
                    int ejercicio = parametro.ejercicio;
                    string periodo = parametro.periodo;
                    string periodoDescripcion = parametro.periododesc;
                    string periodicidad = parametro.periodicidad;
                    string periodicidadDescripcion = parametro.periodicidaddesc;
                    string tipoDeclaracion = parametro.tipodeclaracion;
                    string tipoDeclaracionDescripcion = parametro.tipodeclaraciondesc;
                    string tipoComplementaria = parametro.tipocomplementaria;
                    string tipoComplementariaDescripcion = parametro.tipocomplementariadesc;
                    string NoReforma = parametro.noreforma;
                    bool contieneErrores = parametro.errores ?? false;

                    string uriBlob = string.Empty;
                    using (var declaracion = new Declaracion())
                    {
                        uriBlob = declaracion.AlmacenarDeclaracionTemporal(xmldeclaracion, rfc, idDeclaracion, ejercicio,
                         periodo, periodoDescripcion, periodicidad, periodicidadDescripcion,
                         tipoDeclaracion, tipoDeclaracionDescripcion, tipoComplementaria, tipoComplementariaDescripcion, NoReforma,
                          contieneErrores);
                    }

                    if (string.IsNullOrWhiteSpace(uriBlob))
                    {
                        resultado = new ResultadoViewModel()
                        {
                            Excepcion = "Error desconocido.",
                            EsValido = false,
                            Mensaje = "Se generó un error al guardar la declaración. Inténtelo nuevamente."
                        };

                        var ex =
                            new Exception("Se generó un error al guardar la declaración, URI vacío en AlmacenarDeclaracionTemporal");

                        RegistroEvento.Error(
                            ref ex,
                            CodigoEvento.ErrorNegocio,
                            "DeclaracionController",
                            rfc: rfc,
                            regimen: idDeclaracion,
                            ejercicio: ejercicio.ToString(),
                            tipoDeclaracion: tipoDeclaracion,
                            origen: "Portal");
                    }
                    else
                    {
                        /*Se regresa el idDeclaración encriptado para envíos en claro desde la url*/
                        resultado = new ResultadoViewModel()
                        {
                            EsValido = true,
                            Mensaje = new Sat.DyP.Herramientas.Encripcion.Encripcion().EncriptaCadena(idDeclaracion, Sat.DyP.Herramientas.Encripcion.TipoEncripcion.Base64URL)
                        };
                    }
                }
                else
                {
                    string mensajeError =
                        string.Format(
                            "El parametro viene vacio en AlmacenarDeclaracionTemporal para el RFC: {0}",
                            contribuyente != null && !string.IsNullOrEmpty(contribuyente.Rfc)
                                ? contribuyente.Rfc
                                : "NULO");

                    RegistroEvento.Informacion(
                        mensajeError,
                        CodigoEvento.InformacionNegocio,
                        "DeclaracionController",
                        null);

                    resultado = new ResultadoViewModel()
                    {
                        Excepcion =
                                            "El parámetro data viene vecío en AlmacenarDeclaracionTemporal",
                        EsValido = false,
                        Mensaje = mensajeError
                    };
                }
            }
            catch (Exception ex)
            {
                resultado = new ResultadoViewModel()
                {
                    EsValido = false,
                    Mensaje =
                                        "Se generó un error al guardar la declaración. Inténtelo nuevamente."
                };
                RegistroEvento.Error(
                    ref ex,
                    CodigoEvento.ErrorNegocio,
                    "DeclaracionController",
                    rfc: contribuyente != null && !string.IsNullOrEmpty(contribuyente.Rfc) ? contribuyente.Rfc : "NULO");
            }

            return this.Json(resultado, JsonRequestBehavior.AllowGet);
        }

        public ActionResult Abrir(string id)
        {
            ActionResult vista = this.View(RecursoClasificador.ParcialErrorEnPermisos);
            var encabezado = new EncabezadoDypClasificador();

            try
            {
                ContribuyenteInfo contribuyente = this.ContribuyenteAutenticado();

                // TODO: Incluir la petición desde lugar referido
                // this.PeticionDesdeLugarReferido() :
                if (!string.IsNullOrEmpty(id) && contribuyente.Espms)
                {
                    DeclaracionClasificador declaracion = DeclaracionClasificadorComplementos.ObtenerDeclaracionDedeUrl(id);
                    var encriptador = new Sat.DyP.Herramientas.Encripcion.Encripcion();
                    var limpio = encriptador.DesencriptaCadena(id, Sat.DyP.Herramientas.Encripcion.TipoEncripcion.Base64URL);
                    
                    this.ImportarDatos(declaracion);

                    if (contribuyente.Rfc == declaracion.Rfc)
                    {
                        declaracion.ActualizarDeclaracionPorAbrirDeclaracion();

                        var pago = new DeterminacionPagoDyP();
                        var respuesta = pago.ConsultarOpcPagoISREnClasificador(declaracion.Ejercicio, declaracion.Rfc);
                        bool ocisr = string.IsNullOrEmpty(respuesta);

                        var idencriptado = declaracion.CodigoEncirptado(contribuyente.Token);
                        encabezado = declaracion.ObtenerEncabezado();
                        /********************************************************************************************************************/
                        var parameters = new Dictionary<int, Dictionary<string, string>>();
                        string IdDeclaracion = limpio.Split(',').Where(i => i.Contains("idd")).FirstOrDefault().Split(':')[1];
                        string IdReforma = limpio.Split(',').Where(i => i.Contains("ref")).FirstOrDefault().Split(':')[1];

                        //if (limpio.Split(',').Where(i => i.Contains("redi")).FirstOrDefault() == null)
                        //{
                        //    vista = Redirect("VistaPrevia/" + encriptador.EncriptaCadena("r:" + declaracion.Rfc + ",idd:" + IdDeclaracion + ",ref:" + IdReforma + "redi:0", Sat.DyP.Herramientas.Encripcion.TipoEncripcion.Base64URL));
                        //}
                        //else
                        //{
                            parameters.Add(0, new Dictionary<string, string>() {
                                { "NoReforma", IdReforma },
                                { "OpcionCalculoISR", ocisr ? "-1" : respuesta }
                            });

                            parameters.Add(1, new Dictionary<string, string>() {
                                { "NoDeclaracion", IdDeclaracion },
                                { "presentaDeclaracion", "true" },
                                { "muestraOCISR", ocisr ? "1" : "0" }
                            });
                            /********************************************************************************************************************/

                            this.ViewBag.Info = declaracion.ParametrosVistaPrevia(parameters);
                            ViewBag.idencriptado = idencriptado;
                            vista = View("VistaPrevia");
                        //}
                    }
                }
            }
            catch (Exception ex)
            {
                RegistroEvento.Error(ref ex, CodigoEvento.ErrorNegocio, RecursoClasificador.ErrorEnAutenticacion, null, null, origen: RecursoClasificador.ClasificadorOrigen);
            }

            TempData[TEMP_DATA_ENCABEZADO] = encabezado;
            return vista;
        }
        
        /// <summary>
        /// Obtiene la plantilla completa de un formulario,
        /// </summary>
        /// <param name="data">
        /// Json con los parametros
        /// </param>
        /// <returns>
        /// The <see cref="ActionResult"/>.
        /// </returns>
        [EnableCompression]
        [HttpPost]
        [ValidateAntiForgeryToken]
        public ActionResult ObtenerPlantilla(string data)
        {
            ResultadoViewModel resultado = null;
            try
            {
                ContribuyenteInfo contribuyente = this.ContribuyenteAutenticado();
                string idAlscEmpleado = string.Empty;
                string rfcEmpleado = string.Empty;
                string mensaje = string.Empty;
                string formulario = "new";
                int codigoRespuesta = (int)CodigoRespuestaGeneral.OK;
                List<string> xmlBase64 = new List<string>();

                if (contribuyente == null)
                {
                    new HomeController().ObtieneInfoFederacion();
                    contribuyente = MemberCache.Instancia.UsuarioActual;
                }

                if (ConfiguracionApp.AdaptadorCloud.RecuperarBoolean("IsPortalEmpleado"))
                {
                    idAlscEmpleado = MemberCache.Instancia.EmpleadoActual.Alsc;
                    rfcEmpleado = MemberCache.Instancia.EmpleadoActual.Rfc;
                }

                dynamic parametro = JsonConvert.DeserializeObject(data);
                parametro.Rfc = contribuyente.Rfc;
                parametro.TipoContribuyente = contribuyente.TipoContribuyente;
                parametro.MetodoAutenticacion = contribuyente.MetodoAutenticacion;
                parametro.idAlscEmpleado = idAlscEmpleado;
                parametro.rfcEmpleado = rfcEmpleado;
                var declaracion = new Sat.DeclaracionesAnuales.Portal.Negocio.Declaraciones.Declaracion();
                declaracion.obtieneTotales += (r, e, p, d) => {
                    return new Sat.DyP.Clasificador.Negocio.AdministradorTotalesClasificador(int.Parse(e)).ObtenerTotalesGuardadosCalculados(r, int.Parse(e), int.Parse(p), int.Parse(d)); };
                xmlBase64 = declaracion.ObtenerPlantillaObligaciones(parametro, out formulario, out codigoRespuesta);

                resultado = new ResultadoViewModel()
                {
                    EsValido = (CodigoRespuestaGeneral)codigoRespuesta == CodigoRespuestaGeneral.OK,
                    Xml = xmlBase64,
                    Formulario = formulario,
                    Contribuyente = contribuyente
                };
            }
            catch (Exception ex)
            {
                resultado = new ResultadoViewModel()
                {
                    EsValido = false,
                    Mensaje = "Se generó un error al obtener la plantilla de la declaración. Inténtelo nuevamente."
                };

                RegistroEvento.Error(ref ex, CodigoEvento.ErrorNegocio, "DeclaracionController");
            }

            var jsonResult = this.Json(resultado, JsonRequestBehavior.AllowGet);
            jsonResult.MaxJsonLength = int.MaxValue;
            return jsonResult;
        }

        /// <summary>
        /// Recibe la declaración del contribuyente
        /// </summary>
        /// <param name="data">
        /// JSON con los valores de configuración
        /// </param>
        /// <returns>
        /// Uri del archivo de acuse
        /// </returns>
        [HttpPost]
        [ValidateInput(false)]
        [ValidateAntiForgeryToken]
        public ActionResult RecibeDeclaracion(string data)
        {
            ResultadoViewModel resultado = null;
            try
            {
                ContribuyenteInfo contribuyente = this.ContribuyenteAutenticado();

                string idDeclaracion = data;
                string mensajeError;
                string uriArchivoAcuse;


                using (Declaracion negocioDeclaracion = new Declaracion())
                {

                    uriArchivoAcuse = negocioDeclaracion.RecibeDeclaracion(contribuyente.Rfc, idDeclaracion, out mensajeError);
                }

                if (string.IsNullOrEmpty(mensajeError))
                {
                    resultado = new ResultadoViewModel()
                    {
                        EsValido = true,
                        Archivo = uriArchivoAcuse,
                    };
                }
                else
                {
                    resultado = new ResultadoViewModel() { EsValido = false, Mensaje = mensajeError };
                }                
            }
            catch (Exception ex)
            {
                resultado = new ResultadoViewModel()
                {

                    EsValido = false,
                    Mensaje =
                                        "Se generó un error al recibir la declaración. Inténtelo nuevamente."
                };

                RegistroEvento.Error(ref ex, CodigoEvento.ErrorNegocio, "DeclaracionController");
            }

            var jsonResult = this.Json(resultado, JsonRequestBehavior.AllowGet);
            jsonResult.MaxJsonLength = int.MaxValue;
            return jsonResult;
        }

        /// <summary>
        /// Recibe la declaración firmada del contribuyente
        /// </summary>
        /// <param name="data">
        /// JSON con los valores de configuración
        /// </param>
        /// <returns>
        /// Uri del archivo de acuse
        /// </returns>
        [HttpPost]
        public ActionResult RecibeDeclaracionFirmada(string data)
        {
            ResultadoViewModel resultado = null;
            try
            {
                ContribuyenteInfo contribuyente = this.ContribuyenteAutenticado();

                string uriArchivoAcuse = string.Empty;

                var parametro = System.Web.Helpers.Json.Decode(data);

                string mensajeError;
                string rfc = contribuyente.Rfc;
                string idDeclaracion = parametro["idDeclaracion"];
                string numeroCertificado = parametro["numeroCertificado"];
                string firma = parametro["firma"];
                string folioFirmado = parametro["folioStampCertificado"];

                    using (var declaracion = new Declaracion())
                    {
                        uriArchivoAcuse = declaracion.RecibeDeclaracionFirmada(
                            new Sat.DyP.Herramientas.Entidad.Declaracion.ReciboDeclaracionFirmada() {
                                rfc = rfc,
                                firma = firma,
                                folioFirmado = folioFirmado,
                                idDeclaracion = idDeclaracion,
                                numeroCertificado = numeroCertificado
                            }, out mensajeError);
                    }

                if (string.IsNullOrEmpty(mensajeError))
                {
                    resultado = new ResultadoViewModel()
                    {
                        EsValido = true,
                        Archivo = uriArchivoAcuse,
                        Mensaje = ""
                    };
                }
                else
                {
                    resultado = new ResultadoViewModel() { EsValido = false, Mensaje = mensajeError };
                }

            }
            catch (Exception ex)
            {
                resultado = new ResultadoViewModel()
                {

                    EsValido = false,
                    Mensaje =
                                        "Se generó un error al recibir la declaración. Inténtelo nuevamente."
                };
                RegistroEvento.Error(ref ex, CodigoEvento.ErrorNegocio, "DeclaracionController");
            }

            var jsonResult = this.Json(resultado, JsonRequestBehavior.AllowGet);
            jsonResult.MaxJsonLength = int.MaxValue;
            return jsonResult;
        }


        /// <summary>
        /// Método para mostrar la vista para el firmado de la declaración
        /// </summary>
        /// <returns>
        /// The <see cref="ActionResult"/>.
        /// </returns>
        public ActionResult StepSign()
        {
            ContribuyenteInfo contribuyente = this.ContribuyenteAutenticado();
            ViewBag.Rfc = Utileria.Instancia.CodificarBase64(contribuyente.Rfc);
            return this.View();
        }

        private void ImportarDatos(DeclaracionClasificador declaracion)
        {
            Dictionary<string, string> clasificadorParams = new Dictionary<string, string>();
            clasificadorParams.Add(RecursoClasificador.DiferenciaValidacionCFDI, ConfiguracionApp.AdaptadorCloud.RecuperarEntero(RecursoClasificador.DiferenciaValidacionCFDI).ToString());

            var idencriptado = declaracion.CodigoEncirptado(string.Empty);

            clasificadorParams.Add(RecursoClasificador.EjercicioParametro, declaracion.Ejercicio.ToString());
            clasificadorParams.Add(RecursoClasificador.PeriodoParametro, declaracion.Periodo.ToString());
            clasificadorParams.Add(RecursoClasificador.DeclaracionParametro, declaracion.Consecutivo.ToString());
            clasificadorParams.Add(RecursoClasificador.ParametroVistaPrevia, idencriptado);
            clasificadorParams.Add(RecursoClasificador.ParametroEsPMS, declaracion.EncriptadosParaDyP());

            ViewBag.parametrosClasificador = new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(clasificadorParams);
        }

        /// <summary>
        /// Obtenemos la cadena original de la declaración
        /// </summary>
        /// <param name="data">
        /// JSON con los valores de configuración
        /// </param>
        /// <returns>
        /// Cadena original en Base 64
        /// </returns>
        [HttpPost]
        public ActionResult ObtenerCadenaOriginal(string data)
        {
            ResultadoViewModel resultado = null;
            try
            {
                ContribuyenteInfo contribuyente = this.ContribuyenteAutenticado();

                string cadenaOriginal = string.Empty;
                var parametro = System.Web.Helpers.Json.Decode(data);
                string rfc = contribuyente.Rfc;
                string idDeclaracion = parametro["idDeclaracion"];

                using (var declaracion = new Declaracion())
                {
                    cadenaOriginal = declaracion.ObtenerCadenaOriginal(rfc, idDeclaracion);
                }

                resultado = new ResultadoViewModel()
                {
                    EsValido = true,
                    Archivo = cadenaOriginal,
                    Contribuyente = contribuyente
                };
            }
            catch (Exception ex)
            {
                resultado = new ResultadoViewModel()
                {

                    EsValido = false,
                    Mensaje = "Se generó un error al obtener la cadena original. Inténtelo nuevamente."
                };
                RegistroEvento.Error(ref ex, CodigoEvento.ErrorNegocio, "DeclaracionController");
            }

            var jsonResult = this.Json(resultado, JsonRequestBehavior.AllowGet);
            jsonResult.MaxJsonLength = int.MaxValue;
            return jsonResult;
        }

        #endregion
    }
}