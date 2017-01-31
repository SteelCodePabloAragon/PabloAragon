namespace Sat.DeclaracionesAnuales.Descarga
{
    using AccesoDatos.Manejador.PerfilDeclaracion;
    using DyP.Clasificador.Entidades.Azure;
    using DyP.Clasificador.Negocio;
    using Microsoft.ServiceBus.Messaging;
    using Newtonsoft.Json;
    using Sat.DeclaracionesAnuales.AccesoDatos.Manejador.Dispersion;
    using Sat.DeclaracionesAnuales.AccesoDatos.Manejador.Procesamiento;
    using Sat.DeclaracionesAnuales.Cache;
    using Sat.DeclaracionesAnuales.Entidad.Atributos;
    using Sat.DeclaracionesAnuales.Entidad.Azure;
    using Sat.DeclaracionesAnuales.Entidad.Catalogo;
    using Sat.DeclaracionesAnuales.Entidad.Consulta;
    using Sat.DeclaracionesAnuales.Entidad.Enumeracion;
    using Sat.DeclaracionesAnuales.Entidad.Extension;
    using Sat.DeclaracionesAnuales.OnPremise.ConsultaIdC.ContratoRelay;
    using Sat.DeclaracionesAnuales.OnPremise.ConsultaIdC.Servicio;
    using Sat.DeclaracionesAnuales.Transformacion.Xslt;
    using Sat.DyP.Herramientas.Configuracion;
    using Sat.DyP.Herramientas.Excepcion.Base;
    using Sat.DyP.Herramientas.Excepcion.Procesamiento;
    using Sat.DyP.Herramientas.Logger;
    using Sat.DyP.Herramientas.Recurso;
    using Sat.DyP.Herramientas.Recurso.Configuracion;
    using Sat.DyP.Herramientas.Recurso.Negocio;
    using Sat.DyP.Herramientas.Recurso.Procesamiento;
    using System;
    using System.Collections.Generic;
    using System.Diagnostics;
    using System.IO;
    using System.Linq;
    using System.Reflection;
    using System.Text;
    using System.Xml.Linq;
    using System.Xml.Serialization;
    using Regimen = Entidad.Catalogo.Regimen;

    /// <summary>
    /// 
    /// </summary>
    public class PreCarga : IDisposable
    {
        static QueueClient Client;
        public enum accion { Totales = 1, Plantillas = 2, Complementaria = 3, Temporal = 4 }
        /// <summary>
        /// Realiza llamadas rest de los servicios que expone DyP que se especifiquen
        /// </summary>
        /// <param name="s">parámetros de entrada del  servicio rest en formato json</param>
        /// <param name="m">método que implementa el servicio rest (GET, POST, PUT, DELETE)</param>
        /// <param name="u">url del servicio a llamar</param>
        /// <returns></returns>
        public delegate string RestServiceCall(string s, string m, string u);
        /// <summary>
        /// Cálculo de totales del Clasificador
        /// </summary>
        /// <param name="p">Parametros</param>
        /// <param name="p[0]">RFC</param>
        /// <param name="p[1]">Ejercicio</param>
        /// <param name="p[2]">Periodo</param>
        /// <param name="p[3]">Declaración|Periodicidad</param>
        /// <param name="a">Acción</param>
        /// <returns></returns>
        public delegate dynamic Portal(string[] p, accion a);
        /// <summary>
        /// Evento de llamado RestService a DyP (Datos iniciales | Acumulados)
        /// </summary>
        public RestServiceCall DeclaracionDatos;
        /// <summary>
        /// Obtiene Totales | Plantillas | Complementaria | Temporal
        /// p[0]=RFC
        /// p[1]=Ejercicio
        /// p[2]=Periodo
        /// p[3]=Declaración|Periodicidad
        /// a=Acción
        /// </summary>
        public Portal ejecutaAccion;

        /// <summary>
        /// 
        /// </summary>
        /// <param name="pc">Entidad con los datos de la precarga</param>
        /// <param name="codigoRespuesta">Codigo de respuesta</param>
        /// <param name="tipoDeclaracionId">Tipo de la declaración (Valor desde DyP)</param>
        /// <returns></returns>
        public string ObtenerDatosContribuyente(Entities.PrecargaContribuyente pc, out int codigoRespuesta)
        {
            var timmer = new Stopwatch();
            var timmerGeneral = new Stopwatch();
            int tipoDeclaracionId = 0;

            timmerGeneral.Start();

            var cultureInfo = new System.Globalization.CultureInfo("es-MX");
            RegistroEvento.Advertencia(string.Format("{0}   -   Medicion Tiempo INICIO Precarga",
                timmer.Elapsed.TotalSeconds), CodigoEvento.AdvertenciaInfraestrucura, "TIMER", "PrecargaInformacion",
                ConfiguracionApp.AdaptadorCloud.RecuperarFechaFormatoISO(),
                string.Format("PRECARGA INFORMACION - {0}", (pc.presentaDeclaracion ? "Presentación" : "VistaPrevia")));

            string texto = string.Empty;
            string idDeclaracionRaiz = string.Empty;
            string idDeclaracionPadre = String.Empty;
            string declaracionVigente = String.Empty;
            codigoRespuesta = (int)CodigoRespuestaGeneral.Error;
            DatosContribuyente contribuyente = null;

            try
            {
                RegistroEvento.Informacion("Antes de ValidarParametrosPrecarga 1", CodigoEvento.InformacionNegocio, GetType().Name, "PreCarga");

                contribuyente = new DatosContribuyente()
                {
                    IdDeclaracion = pc.declaracionID,
                    ClaveObligacionPago = pc.tipoContribuyente.Equals(RecursoNegocio.ClaveTipoPersonaFisica) ? "2" : "4", 
                    MedioAutenticacion = pc.metodoAutenticacion,
                    ClaveUsuarioInicia = ConfiguracionApp.AdaptadorCloud.RecuperarBoolean("IsPortalEmpleado") ? pc.rfcEmpleado : pc.rfc,
                    Addenda = "Addenda",                  
                    DeclaracionVigente = declaracionVigente,
                    IdDeclaracionPadre = !String.IsNullOrEmpty(idDeclaracionPadre) ? new Guid(idDeclaracionPadre) : Guid.Empty,
                    IdDeclaracionRaiz = !String.IsNullOrEmpty(idDeclaracionRaiz) ? new Guid(idDeclaracionRaiz) : Guid.Empty,
                    FechaConfiguracionDeclaracion = RecuperarFechaSinHoraISO()
                };

                RegistroEvento.Advertencia(string.Format("{0}   -   Medicion Tiempo Obtener Fecha Vencimiento", timmer.Elapsed.TotalSeconds), CodigoEvento.AdvertenciaInfraestrucura, "TIMER", "PrecargaInformacion", ConfiguracionApp.AdaptadorCloud.RecuperarFechaFormatoISO(), string.Format("PRECARGA INFORMACION - {0}", (pc.presentaDeclaracion ? "Presentación" : "VistaPrevia")));

                /********************************************************Apartado Información inicial********************************************************/
                string postParam = @"{ ""IdDeclaracion"": """ + pc.declaracionID.ToString() + @""", ""IdReforma"": """ + pc.reformaID + @""" }";
                string[] arraInfo = null;
                string[] obligaciones = null;
                if (pc.presentaDeclaracion)
                {
                    if (DeclaracionDatos != null)
                    {
                        string param="";
                        try
                        {
                            param = DeclaracionDatos(postParam, "POST", ConfiguracionApp.AdaptadorCloud.RecuperarCadena("DeclaracionInit"));
                        }
                        catch (Exception e) {
                            ExcepcionGeneral ex = new ExcepcionGeneral(string.Format("Error en el servicio de Consulta de DyP: {0}", postParam), e);
                            RegistroEvento.Error(ex, CodigoEvento.ErrorNegocio, GetType().Name,
                                     pc.rfc, (contribuyente != null ? contribuyente.TipoDeclaracion : ""), "",
                                     (contribuyente != null ? contribuyente.Ejercicio.ToString() : ""),
                                     fechaRegistro: ConfiguracionApp.AdaptadorCloud.RecuperarFechaFormatoISO());
                            
                            codigoRespuesta = (int)CodigoRespuestaGeneral.Error;
                            throw ex;
                        }

                        //@"{""IdDeclaracion"":60007571,""Contenido"":{""Metadata"":{""SAT_DECLR_CLASS"":""001"",""SAT_UPD_FORM_ID"":""60007571"",""SAT_DECLAR_CATEG"":"""",""SAT_DECLARATN_TYPE"":""001"",""SAT_DESCR_DECLARATN_TYPE"":null,""SAT_DESCR_DECLAR_CATEG"":"""",""SET_ID"":""SATCR"",""PRODUCT_GROUP_TYPE"":""ACCT"",""REFORM_ID"":""2016Reforma02.01"",""SAT_CT"":""N"",""PRODUCT_GROUP"":[""0301""],""EXCEPTION"":[""0301""],""SAT_SIMPLIFICADO"":[""0301""]},""Data"":{""SAT_DECL"":{""version"":""2016Reforma02.01"",""DECLARACION"":{""SAT_DAT_IDENT"":{""SAT_DECLAR_CATEG"":"""",""SAT_FISCAL_PERIOD"":""003"",""SAT_DESCR_DECLARATN_TYPE"":""Normal"",""DESCR2"":""Mensual"",""DESCR1"":""Marzo"",""SAT_DECLR_CLASS"":""001"",""DUE_DATE"":""21/04/2016"",""SAT_CAUS_DT"":"""",""SAT_CAUSACION_DT"":""01/03/2016"",""SAT_FISCAL_YEAR"":""2016"",""SAT_DECLAR_TYPE_CD"":""001"",""DURATION_FREQ"":""M"",""SAT_DESCR_DECLAR_CATEG"":"""",""SAT_LOAD_DATA"":""ON"",""SAT_RFC"":""AACE7409065V7"",""SAT_ONLINE"":""Y"",""SAT_PRSNT_DECLR_DT"":""21/12/2016"",""SAT_REL_DECLRTN_ID"":""0"",""SAT_DECLARATN_TYPE"":""001"",""SAT_UPD_FORM_ID"":""60007571"",""ALSC"":""O-045"",""SAT_INPCO"":""218.532000000000"",""SAT_INPCC"":""218.532000000000"",""POSTAL"":""48380"",""SAT_CURP"":""AACE740906HJCRRD03"",""BO_NAME_1"":null,""STATE"":""14"",""SAT_FIRST_NAME"":"""",""SAT_CORP_TYPE"":null,""FIRST_NAME"":""MARIA TRINIDAD"",""SAT_LAST_NAME"":"""",""SAT_ADDRESS"":""MAR DE LAS ANTILLAS"",""SECOND_LAST_NAME"":""LOPEZ"",""PHONE"":"""",""EMAIL_ADDR"":null,""PERSON_ID"":"""",""HOUSE_TYPE"":""3 - LOCAL COMERCIAL"",""COUNTY"":"""",""SAT_TOWN_CODE"":""48380001"",""BO_NAME"":null,""SAT_MUNICIPALITY"":""PUERTO VALLARTA"",""SAT_REGROWS"":"""",""SAT_TIPOPERS"":""F"",""LAST_NAME"":""CONTRERAS"",""SAT_REP_RFC"":"""",""SAT_COLONY_CD"":""EMILIANO ZAPATA"",""SAT_SECOND_LNAME"":"""",""SAT_REP_CURP"":"""",""ADDRESS4"":""3108 B - "",""SAT_REFERENCE"":""LUIS MOYA Y 2DA DE ARTEAGA"",""SAT_ROL_BUENFIN"":null,""SAT_RIF"":""N"",""FS_STT_PF"":""Y"",""SAT_SIMPLIFICADO"":""Y"",""SAT_IDENTIFICADOR_LC"":""00"",""SAT_ORIGEN"":""1"",""SAT_CLASE"":""001"",""SAT_AUTEN_FIEL"":""N"",""SAT_SELLO_FIEL"":"""",""SAT_DEVIVA_MAX"":""1000000"",""SAT_CUENTA_CLABE"":""019000080010785999|131028000003387804"",""DAT_CTA_TRIB"":""|A-68|300236|R|14|595|67|375186777383794925279015002644|AACE740906HJCRRD03|213577565"",""SAT_FACILITY_IETU"":null,""SAT_APLIC_CLASIFICADOR"":"""",""SAT_HABIL_PRECARGA"":""""},""SAT_DAT_COMPL"":{""id"":""0301"",""SAT_DECLAR_CATEG"":""004"",""SAT_IDENT_DEC"":"""",""SAT_OPERATION_ID"":"""",""SAT_DECLAR_CATEG_ANT"":null,""SAT_SUM_PAYMENT_PROV"":null,""SAT_SUM_PAYMENT_ANT"":null,""SAT_LAST_PAYMENT_DT"":null,""SAT_AMOUNT_PAY"":null,""SAT_EXCEPTION"":null}}}}},""ExisteError"":false,""ExcepcionError"":null,""UsuarioError"":null}";
                        dynamic par = JsonConvert.DeserializeObject(param);

                        if (!(bool)par.ExisteError)
                        {
                            obligaciones = par.Contenido.Metadata.PRODUCT_GROUP.ToObject<string[]>();
                            contribuyente.IdentidadContribuyente = new SAT_DAT_IDENT() { REFORM_ID = pc.reformaID };
                            foreach (var p in par.Contenido.Data.SAT_DECL.DECLARACION.SAT_DAT_IDENT)
                            {
                                try
                                {
                                    var propertyInfo = contribuyente.IdentidadContribuyente.GetType().GetProperty(p.Name.ToString());

                                    propertyInfo.SetValue(contribuyente.IdentidadContribuyente, Convert.ChangeType(p.Value, propertyInfo.PropertyType));
                                }
                                catch { }
                            }

                            contribuyente.ClaveTipoDeclaracion = contribuyente.IdentidadContribuyente.SAT_DECLARATN_TYPE.Trim().PadLeft(3, '0');
                            tipoDeclaracionId = int.Parse(contribuyente.IdentidadContribuyente.SAT_DECLARATN_TYPE);
                            contribuyente.ClaveTipoComplementaria = "0";
                            contribuyente.ClavePeriodo = contribuyente.IdentidadContribuyente.SAT_FISCAL_PERIOD;
                            contribuyente.TipoDeclaracion = contribuyente.IdentidadContribuyente.SAT_DESCR_DECLARATN_TYPE;
                            contribuyente.Periodicidad = contribuyente.IdentidadContribuyente.DESCR2;
                            contribuyente.DescripcionPeriodo = contribuyente.IdentidadContribuyente.DESCR1;
                            contribuyente.ClaveClaseDeclaracion = contribuyente.IdentidadContribuyente.SAT_DECLR_CLASS;
                            contribuyente.FechaVencimiento = DateTime.Parse(contribuyente.IdentidadContribuyente.DUE_DATE, cultureInfo);
                            contribuyente.FechaCausacion = !string.IsNullOrEmpty(contribuyente.IdentidadContribuyente.SAT_CAUSACION_DT)
                                ? DateTime.Parse(contribuyente.IdentidadContribuyente.SAT_CAUSACION_DT, cultureInfo) : contribuyente.FechaVencimiento;
                            contribuyente.Ejercicio = int.Parse(contribuyente.IdentidadContribuyente.SAT_FISCAL_YEAR);
                            contribuyente.ClaveTipoDeclaracion = contribuyente.IdentidadContribuyente.SAT_DECLARATN_TYPE;
                            contribuyente.ClavePeriodicidad = contribuyente.IdentidadContribuyente.DURATION_FREQ;
                            contribuyente.OpcionCalculoISR = contribuyente.IdentidadContribuyente.SAT_OPC_PAGO_ISR == "CU" 
                                ? "1" 
                                : contribuyente.IdentidadContribuyente.SAT_OPC_PAGO_ISR == "IG" 
                                    ? "0" : "-1";

                            contribuyente.DatosGenerales = new DatosGenerales()
                            {

                                RazonSocial = contribuyente.IdentidadContribuyente.SAT_FIRST_NAME,
                                TipoSociedad = contribuyente.IdentidadContribuyente.SAT_CORP_TYPE,
                                PersonaId = contribuyente.IdentidadContribuyente.PERSON_ID,
                                TipoPersona = contribuyente.IdentidadContribuyente.SAT_TIPOPERS,
                                Rfc = contribuyente.IdentidadContribuyente.SAT_RFC,
                                Curp = contribuyente.IdentidadContribuyente.SAT_CURP,
                                RfcRepresentante = contribuyente.IdentidadContribuyente.SAT_REP_RFC,
                                CurpRepresentante = contribuyente.IdentidadContribuyente.SAT_REP_CURP,
                                EntidadFederativaVigente = contribuyente.IdentidadContribuyente.STATE,
                                Alsc = contribuyente.IdentidadContribuyente.ALSC,
                                Nombre = contribuyente.IdentidadContribuyente.FIRST_NAME,
                                ApellidoPaterno = contribuyente.IdentidadContribuyente.LAST_NAME,
                                ApellidoMaterno = contribuyente.IdentidadContribuyente.SECOND_LAST_NAME

                            };
                            
                            var tdeclaracion = new string[]{ TipoDeclaracion.Normal.ToDescription(), TipoDeclaracion.ComplementariaCorreccion.ToDescription() };
                            string idDeclaraciones = "";
                            var tipodeclaracionVigente = new List<string>();
                            try
                            {
                                foreach (var p in par.Contenido.Data.SAT_DECL.DECLARACION.SAT_DAT_COMPL)
                                {
                                    bool blnCompl = !string.IsNullOrEmpty(p.SAT_DECLAR_CATEG.ToString());

                                    if (blnCompl && !string.IsNullOrEmpty(p.SAT_IDENT_DEC.ToString()) && 
                                        idDeclaraciones.Split('|').Count(d => d == p.SAT_IDENT_DEC.ToString()) == 0 && 
                                        tdeclaracion.Count(td => td.Equals(p.SAT_DECLAR_CATEG.ToString())) == 0)
                                    {
                                        tipodeclaracionVigente.Add(p.SAT_DECLAR_CATEG.ToString());
                                        idDeclaraciones += p.id.ToString() + "," + p.SAT_IDENT_DEC.ToString() + "|";
                                    }

                                    if (blnCompl && p.id.ToString() == TipoObligacion.IVA.ToDescription())
                                    {
                                        contribuyente.ClaveTipoComplementaria = p.SAT_DECLAR_CATEG.ToString();
                                    }
                                }
                                contribuyente.IdentidadContribuyente.SAT_DECLAR_CATEG = 
                                    tipodeclaracionVigente.Count(td => td == TipoDeclaracion.DejarSinEfecto.ToDescription()) > 0 
                                        ? TipoDeclaracion.DejarSinEfecto.ToDescription()
                                        : contribuyente.IdentidadContribuyente.SAT_DECLAR_CATEG;
                            }
                            catch(Exception e)
                            {
                                ExcepcionGeneral ex = new ExcepcionGeneral(
                                    string.Format(@"Error al iterar el campo ""Contenido.Data.SAT_DECL.DECLARACION.SAT_DAT_COMPL"" en el servicio de Consulta de DyP: {0}", postParam), e);
                                RegistroEvento.Error(ex, CodigoEvento.ErrorNegocio, GetType().Name,
                                         pc.rfc, (contribuyente != null ? contribuyente.TipoDeclaracion : ""), "",
                                         (contribuyente != null ? contribuyente.Ejercicio.ToString() : ""),
                                         fechaRegistro: ConfiguracionApp.AdaptadorCloud.RecuperarFechaFormatoISO());

                                codigoRespuesta = (int)CodigoRespuestaGeneral.Error;
                                throw ex;
                            }

                            //idDeclaraciones = "0145,60007571|0309,60010494";
                            if (!string.IsNullOrEmpty(idDeclaraciones))
                            {
                                //Obtiene Provisional
                                arraInfo = new string[] { pc.rfc, "", "", idDeclaraciones };
                                ejecutaAccion(arraInfo, accion.Complementaria);
                            }
                            else
                            {
                                arraInfo = new string[] { pc.rfc, "", "", pc.declaracionID.ToString() };
                                ejecutaAccion(arraInfo, accion.Temporal);
                            }

                            //Se crea array para obtención de las plantillas en base a las obligaciones (ejecución en ejecutaAccion())
                            arraInfo = new string[] {
                                                string.Empty,
                                                contribuyente.Ejercicio.ToString(),
                                                contribuyente.ClavePeriodo,
                                                contribuyente.ClavePeriodicidad
                                                };
                            Array.Resize(ref arraInfo, 4 + ((string[])obligaciones).Length);
                            Array.Copy((string[])obligaciones, 0, arraInfo, 4, ((string[])obligaciones).Length);
                        }
                        else
                        {
                            string mensaje = string.Format("{0}|{1}", par.ExcepcionError, par.UsuarioError);
                            ExcepcionGeneral ex = new ExcepcionGeneral(mensaje);
                            RegistroEvento.Error(ex, CodigoEvento.ErrorNegocio, GetType().Name,
                                     pc.rfc, (contribuyente != null ? contribuyente.TipoDeclaracion : ""), "",
                                     (contribuyente != null ? contribuyente.Ejercicio.ToString() : ""),
                                     fechaRegistro: ConfiguracionApp.AdaptadorCloud.RecuperarFechaFormatoISO());

                            codigoRespuesta = (int)CodigoRespuestaGeneral.Error;
                            throw ex;

                        }
                    }
                }
                /********************************************************Apartado Información inicial********************************************************/
                else
                {
                    contribuyente.ClavePeriodo = pc.periodo ?? "";
                    contribuyente.Ejercicio = Convert.ToInt32(pc.ejercicio);
                    contribuyente.OpcionCalculoISR = pc.OpcionCalculoISR == "CU" ? "1" : pc.OpcionCalculoISR == "IG" ? "0" : "-1";
                    contribuyente.FechaVencimiento = DateTime.Parse("21/02/2017", cultureInfo);

                    arraInfo = new string[] {
                                    string.Empty,
                                    contribuyente.Ejercicio.ToString(),
                                    contribuyente.ClavePeriodo,
                                    contribuyente.ClavePeriodicidad,
                                    TipoObligacion.ISR.ToDescription(),
                                    TipoObligacion.IVA.ToDescription()
                                };

                    RegistroEvento.Informacion("Antes de ObtenerDatosIdc 7", CodigoEvento.InformacionNegocio, GetType().Name, "PreCarga");

                    timmer.Restart();

                    contribuyente.DatosGenerales = ObtenerDatosIdcV2(pc.rfc);

                    if (contribuyente.DatosGenerales.Roles != null)
                    {
                        contribuyente.Roles = (from x in contribuyente.DatosGenerales.Roles select new Catalogo { IdCatalogo = x.ClaveRol, Descripcion = x.DescripcionRol }).ToList();
                    }

                    timmer.Stop();

                    RegistroEvento.Advertencia(string.Format("{0}   -   Medicion Tiempo Obtener Datos IDC", timmer.Elapsed.TotalSeconds), CodigoEvento.AdvertenciaInfraestrucura, "TIMER", "PrecargaInformacion", ConfiguracionApp.AdaptadorCloud.RecuperarFechaFormatoISO(), string.Format("PRECARGA INFORMACION - {0}", (pc.presentaDeclaracion ? "Presentación" : "VistaPrevia")));
                    RegistroEvento.Informacion("Despues de ObtenerDatosIdc 8", CodigoEvento.InformacionNegocio, GetType().Name, "PreCarga");
                }

                contribuyente.DatosGenerales.AlscPresentacion = pc.alscEmpleado;
                ejecutaAccion(arraInfo, accion.Plantillas);
                RegistroEvento.Informacion("Antes de ArmarXml 9", CodigoEvento.InformacionNegocio, GetType().Name, "PreCarga");
                timmer.Restart();

                using (MemoryStream ms = new MemoryStream())
                {
                    Type tipo = typeof(DatosContribuyente);
                    Type tipoPropiedad = typeof(DatosGenerales);
                    XmlSerializer serializador = new XmlSerializer(tipo);
                    serializador.Serialize(ms, contribuyente);
                    ms.Position = 0;

                    XDocument xdoc = XDocument.Load(ms);
                    XDocument xresult = null;
                    xdoc.Root.RemoveAttributes();

                    texto = TransformacionPreCargaGeneral(xdoc);

                    /********************************************************Apartado Acumulado********************************************************/
                    if (pc.presentaDeclaracion && contribuyente.IdentidadContribuyente != null && 
                        !string.IsNullOrEmpty(contribuyente.IdentidadContribuyente.SAT_APLIC_CLASIFICADOR) &&
                        Convert.ToBoolean(contribuyente.IdentidadContribuyente.SAT_APLIC_CLASIFICADOR))
                    {
                        ObtieneAcumulados(ref texto, pc.rfc, contribuyente.Ejercicio.ToString(), contribuyente.ClavePeriodo, contribuyente.ClavePeriodicidad, contribuyente.TipoDeclaracion, postParam, out codigoRespuesta);
                        xresult = null;
                    }

                    /********************************************************Apartado ClabesBancarias********************************************************/
                    List<XElement> lxe = null;
                    if (contribuyente.IdentidadContribuyente != null && !string.IsNullOrEmpty(contribuyente.IdentidadContribuyente.SAT_CUENTA_CLABE) &&
                        contribuyente.IdentidadContribuyente.SAT_CUENTA_CLABE.Split('|').Length > 0)
                    {
                        lxe = new List<XElement>();
                        foreach (string s in contribuyente.IdentidadContribuyente.SAT_CUENTA_CLABE.Split('|'))
                        {
                            lxe.Add(new XElement("DatosBanco", new XElement[] {
                                new XElement("Clabe") { Value = s },
                                new XElement("ClaveBanco") { Value = s.Substring(0,3) },
                                new XElement("NombreBanco") { Value = string.Empty }
                            }));
                        }

                    }

                    if (xresult == null) xresult = XDocument.Parse(texto);
                    xresult.Element("DatosContribuyente").LastNode.AddAfterSelf(new XElement("ClabesBancarias", lxe));
                    texto = xresult.ToString();

                    XElement xElement = null;
                    /********************************************************Apartado Totales********************************************************/
                    //Se realizará la consulta de totales mientras se indique por DyP que se consulten los totales y además la declaración no sea "Dejar sin efecto"
                    bool esPrecarga = contribuyente.IdentidadContribuyente == null || (!string.IsNullOrEmpty(contribuyente.IdentidadContribuyente.SAT_HABIL_PRECARGA) &&
                        bool.Parse(contribuyente.IdentidadContribuyente.SAT_HABIL_PRECARGA));
                    if (esPrecarga && !(contribuyente != null && contribuyente.IdentidadContribuyente != null && 
                        contribuyente.IdentidadContribuyente.SAT_DECLAR_CATEG == TipoDeclaracion.DejarSinEfecto.ToDescription()))
                    {
                        ObtieneTotales(pc.rfc, contribuyente.Ejercicio.ToString(), contribuyente.ClavePeriodo, contribuyente.OpcionCalculoISR, contribuyente.TipoDeclaracion, cultureInfo, pc.consecutivo, out codigoRespuesta, out xElement);
                        xresult = null;
                    }

                    if (xresult == null)
                    {
                        xresult = XDocument.Parse(texto);
                    }
                    if (xElement == null)
                    {
                        xElement = new XElement("DatosIniciales");
                    }
                    if(obligaciones.Count(o => o == TipoObligacion.ISR.ToDescription()) == 0)
                    {
                        xresult.Element("DatosContribuyente").Element("OpcionCalculoISR").Value = "";
                    }
                    //Habilita o deshabilita los campos de precarga: PREC = 1 - Deshabilita | PREC = 0 - Habilita
                    xElement.Add(new XElement("EsPrecarga", new XAttribute("claveInformativa", "PREC")) { Value = (esPrecarga ? "1" : "0") });
                    //Muestra u oculta el campo de selección de tipo de formulario (IG, CU): MISR = 1 - Muestra | MISR = 0 - Oculta
                    xElement.Add(new XElement("MuestraISR", new XAttribute("claveInformativa", "MISR")) { Value = pc.MuestraCalculoISR });
                    xresult.Element("DatosContribuyente").LastNode.AddAfterSelf(xElement);

                    texto = xresult.ToString();

                    RegistroEvento.Informacion("Despues de ArmarXml 10", CodigoEvento.InformacionNegocio, GetType().Name, "PreCarga");

                    codigoRespuesta = (int)CodigoRespuestaGeneral.OK;
                }

                timmer.Stop();
                RegistroEvento.Advertencia(string.Format("{0}   -   Medicion Tiempo Enzamblado XML", timmer.Elapsed.TotalSeconds), CodigoEvento.AdvertenciaInfraestrucura, "TIMER", "PrecargaInformacion", ConfiguracionApp.AdaptadorCloud.RecuperarFechaFormatoISO(), string.Format("PRECARGA INFORMACION - {0}", (pc.presentaDeclaracion ? "Presentación" : "VistaPrevia")));

            }

            catch (ExcepcionValidaInformacion ex)
            {
                RegistroEvento.Error(ex, CodigoEvento.ErrorNegocio, GetType().Name,
                                     pc.rfc, (contribuyente != null ? contribuyente.TipoDeclaracion : ""), "",
                                     (contribuyente != null ? contribuyente.Ejercicio.ToString() : ""),
                                     fechaRegistro: ConfiguracionApp.AdaptadorCloud.RecuperarFechaFormatoISO());
                texto = ex.Message + ex.StackTrace;
                codigoRespuesta = (int)CodigoRespuestaGeneral.Error;
            }
            catch (BaseException ex)
            {
                RegistroEvento.Error(ex, CodigoEvento.ErrorNegocio, GetType().Name,
                                     pc.rfc, (contribuyente != null ? contribuyente.TipoDeclaracion : ""), "",
                                     (contribuyente != null ? contribuyente.Ejercicio.ToString() : ""),
                                     fechaRegistro: ConfiguracionApp.AdaptadorCloud.RecuperarFechaFormatoISO());
                texto = ex.Message + ex.StackTrace;
            }
            catch (Exception e)
            {
                ExcepcionGeneral ex = new ExcepcionGeneral(e.Message, e);
                RegistroEvento.Error(ex, CodigoEvento.ErrorNegocio, GetType().Name,
                                     pc.rfc, (contribuyente != null ? contribuyente.TipoDeclaracion : ""), "",
                                     (contribuyente != null ? contribuyente.Ejercicio.ToString() : ""),
                                     fechaRegistro: ConfiguracionApp.AdaptadorCloud.RecuperarFechaFormatoISO());
                texto = ex.Message + ex.StackTrace;
            }

            RegistroEvento.Informacion("Antes de Terminar 13", CodigoEvento.InformacionNegocio, GetType().Name, "PreCarga");
            timmerGeneral.Stop();

            RegistroEvento.Advertencia(string.Format("{0}   -   Medicion Tiempo FIN Precarga",
                timmer.Elapsed.TotalSeconds), CodigoEvento.AdvertenciaInfraestrucura, "TIMER", "PrecargaInformacion",
                ConfiguracionApp.AdaptadorCloud.RecuperarFechaFormatoISO(),
                string.Format("PRECARGA INFORMACION - {0}", (pc.presentaDeclaracion ? "Presentación" : "VistaPrevia")), 
                pc.rfc, (contribuyente != null ? contribuyente.TipoDeclaracion : ""), "",
                (contribuyente != null ? contribuyente.Ejercicio.ToString() : ""));

            return Utileria.Instancia.CodificarBase64(texto);
        }

        protected void ManejarExcepcion(Exception ex, string rfc)
        {
            BaseException be = new BaseException(ex);
            RegistroEvento.Error(ref ex, CodigoEvento.ErrorNegocio, GetType().Name, rfc, null, null, null, null, "PreCarga");
        }

        public string RecuperarFechaSinHoraISO()
        {
            DateTime fecha = RecuperarFecha();
            fecha.Date.Add(new TimeSpan(0, 0, 0));
            return Utileria.Instancia.ObtenerCadenaFechaISO(fecha.Date);

        }
        public DateTime RecuperarFecha()
        {
            return TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, TimeZoneInfo.FindSystemTimeZoneById("Central Standard Time (Mexico)"));
        }

        /// <summary>
        /// 
        /// </summary>
        /// <param name="rfc"></param>  
        /// <returns></returns>
        public DatosGenerales ObtenerDatosIdcV2(string rfc)
        {
            DatosGenerales datosGenerales;

            try
            {
                string dataIdc = String.Empty;

                if (this.ValidarVigenciaIdC(rfc, out dataIdc))
                {
                    datosGenerales = JsonConvert.DeserializeObject<DatosGenerales>(dataIdc);
                }
                else
                {
                    datosGenerales = this.InvocarServicioIdC(rfc);
                    this.GuardarDatosIdC(datosGenerales);
                }
            }
            catch
            {
                throw;
            }

            return datosGenerales;
        }

        public DatosGenerales ObtenerDatosIdcV3(string rfc)
        {
            DatosGenerales datosGenerales;

            try
            {
                string dataIdc = String.Empty;

                if (this.ValidarVigenciaIdC(rfc, out dataIdc))
                {
                    datosGenerales = JsonConvert.DeserializeObject<DatosGenerales>(dataIdc);
                }
                else
                {
                    datosGenerales = this.InvocarServicioIdCV3(rfc);
                    this.GuardarDatosIdC(datosGenerales);
                }
            }
            catch
            {
                throw;
            }

            return datosGenerales;
        }

        private void ValidarDatosIdc(DatosGenerales datos)
        {
            if (String.IsNullOrEmpty(datos.Rfc))
                throw new ExcepcionValidaInformacion(String.Format(RecursoMensajeError.ErrorDatosGeneralesIdc, RecursoNegocio.DatoIdcRfc, datos.Rfc));

            if (String.IsNullOrEmpty(datos.Alsc))
                throw new ExcepcionValidaInformacion(String.Format(RecursoMensajeError.ErrorDatosGeneralesIdc, RecursoNegocio.DatoIdcAlr, datos.Alsc));

            if (String.IsNullOrEmpty(datos.BoId))
                throw new ExcepcionValidaInformacion(String.Format(RecursoMensajeError.ErrorDatosGeneralesIdc, RecursoNegocio.DatoIdcBoId, datos.BoId));

            /* Algunos datos de RFCs de Estrés no tienen este campo <cesarsol>
            if(String.IsNullOrEmpty(datos.PersonaId))
                        throw new ExcepcionValidaInformacion(String.Format(RecursoMensajeError.ErrorDatosGeneralesIdc,
                            RecursoNegocio.DatoIdcPersonaId, datos.PersonaId));
            */
                    if (!String.IsNullOrEmpty(datos.TipoPersona) &&
                (datos.TipoPersona.Equals(RecursoNegocio.ClaveTipoPersonaFisica) || datos.TipoPersona.Equals(RecursoNegocio.ClaveTipoPersonaMoral)))
            {
                if (datos.TipoPersona.Equals(RecursoNegocio.ClaveTipoPersonaFisica))
                {
                    if (String.IsNullOrEmpty(datos.Nombre))
                        throw new ExcepcionValidaInformacion(String.Format(RecursoMensajeError.ErrorDatosGeneralesIdc, RecursoNegocio.DatoIdcNombre, datos.Nombre));

                    if (String.IsNullOrEmpty(datos.ApellidoPaterno))
                        throw new ExcepcionValidaInformacion(String.Format(RecursoMensajeError.ErrorDatosGeneralesIdc, RecursoNegocio.DatoIdcApellidoPaterno, datos.ApellidoPaterno));
                }
                else if (String.IsNullOrEmpty(datos.RazonSocial))
                {
                    throw new ExcepcionValidaInformacion(String.Format(RecursoMensajeError.ErrorDatosGeneralesIdc, RecursoNegocio.DatoIdcDenominacion, datos.RazonSocial));
                }
            }
            else
            {
                throw new ExcepcionValidaInformacion(String.Format(RecursoMensajeError.ErrorDatosGeneralesIdc, RecursoNegocio.DatoIdcTipoPersona, datos.TipoPersona));
            }
        }

        private string ObtenerAlsc(string alr)
        {
            int alrId;
            string resultado = String.Empty;

            if (Int32.TryParse(alr, out alrId))
            {
                // TODO: Esta tronando porque no existe una base con el catálogo
                // var alrid = CacheCatalogo.Instancia.ObtenerAlscAlrXId(alrId);
                //if (alrid != null)
                //{
                //    resultado = alrid.IdCatalogo;
                //}
                resultado = "A-11";
            }
            else
            {
                throw new ExcepcionValidaInformacion(String.Format(RecursoMensajeError.ErrorDatosGeneralesIdc, RecursoNegocio.DatoIdcAlr, alr));
            }

            return resultado;
        }

        private DateTime ObtenerFechaVencimiento(Regimen regimen, string ejercicio, bool? ValorElegido = null)
        {
            DateTime fechaRegimen = new DateTime();

            if (ValorElegido != null)
            {
                var lstVigencia = CacheCatalogo.Instancia.RecuperaCatalogoVigencias();
                int MesVigencia = lstVigencia.Where(d => d.Valor == ValorElegido).FirstOrDefault().Mes;
                int DiaVigencia = lstVigencia.Where(d => d.Valor == ValorElegido).FirstOrDefault().Dia;
                fechaRegimen = new DateTime(Convert.ToInt32(ejercicio) + 1, MesVigencia, DiaVigencia);
            }
            else
            {
                //TODO: Cambiar el calculo del año de la fecha para que sea el actual, solo se queda para pruebas
                fechaRegimen = new DateTime(Convert.ToInt32(ejercicio) + 1, regimen.MesVencimiento, regimen.DiaVencimiento);
            }

            IList<DiaInhabil> dias = CacheCatalogo.Instancia.ObtenerDiasInhabiles(fechaRegimen.Year);

            while (fechaRegimen.DayOfWeek.Equals(DayOfWeek.Saturday) ||
                   fechaRegimen.DayOfWeek.Equals(DayOfWeek.Sunday) ||
                   EsDiaInhabil(dias, fechaRegimen))
                fechaRegimen = fechaRegimen.AddDays(1);

            return fechaRegimen;
        }

        private DateTime? ObtenerFechaVencimiento(Regimen regimen, DateTime? fechaCausacion)
        {
            int totalDiasHabiles = regimen.DiaVencimiento;
            DateTime? fechaRegimen = fechaCausacion.Value;

            List<DiaInhabil> dias = new List<DiaInhabil>(CacheCatalogo.Instancia.ObtenerDiasInhabiles(fechaCausacion.Value.Year));

            if (fechaCausacion.Value.Month == 12)
                dias.AddRange(CacheCatalogo.Instancia.ObtenerDiasInhabiles(fechaCausacion.Value.Year + 1));

            int i = 0;

            while (i < totalDiasHabiles)
            {
                fechaRegimen = fechaRegimen.Value.AddDays(1);

                if (!(fechaRegimen.Value.DayOfWeek.Equals(DayOfWeek.Saturday) ||
                       fechaRegimen.Value.DayOfWeek.Equals(DayOfWeek.Sunday) ||
                       EsDiaInhabil(dias, fechaRegimen.Value)))
                {
                    i++;
                }
            }

            return fechaRegimen;
        }

        private Regimen ObtenerRegimen(string regimenId)
        {
            return CacheCatalogo.Instancia.ObtenerRegimenXId(regimenId);
        }

        private bool EsDiaInhabil(IList<DiaInhabil> dias, DateTime fecha)
        {
            return dias.Where(d => d.FechaInhabil.CompareTo(fecha) == 0).Any();
        }

       
        private void AgregarClaveInformativa(XElement elemento, PropertyInfo propiedad)
        {
            var atributo = (AtributoFormulario)Attribute.GetCustomAttribute(propiedad, typeof(AtributoFormulario));

            if (elemento != null && atributo != null)
            {
                elemento.SetAttributeValue("claveInformativa", atributo.ClaveInformativa);
            }
        }

        private string TransformacionPreCargaGeneral(XDocument datosPersona)
        {
            string datosXml = String.Empty;

            using (MotorXslt motor = new MotorXslt())
            {
                using (Stream msMotor = motor.RecuperaPlantilla(RecursoPlantilla.PlantillaPrecargaGeneral))
                {
                    var xmlTransformacion = motor.Transforma(msMotor, datosPersona);
                    datosXml = xmlTransformacion;
                }
            }

            return datosXml;
        }

        private bool ValidarVigenciaIdC(string rfc, out string dataIdc)
        {
            bool resultado = false;

            using (AdministradorDeclaracion declaracion = new AdministradorDeclaracion())
            {
                DatosIdC registro = declaracion.ObtenerRegistroIdC(rfc);
                dataIdc = String.Empty;

                if (registro != null)
                {
                    DateTime fechaVencimiento = registro.FechaActualizacion.AddHours(ConfiguracionApp.AdaptadorCloud.
                        RecuperarEntero(RecursoNegocio.ParametroHorasVigenciaDatosIdC, 24));

                    if (fechaVencimiento.CompareTo(ConfiguracionApp.AdaptadorCloud.RecuperarFecha()) >= 0)
                    {
                        dataIdc = Encoding.UTF8.GetString(declaracion.ObtenerDatosArchivoIdC(registro));
                        resultado = true;
                    }
                }
            }

            return resultado;
        }

        private DatosGenerales InvocarServicioIdC(string rfc)
        {
            DatosGenerales datosGenerales;
            try
            {
                using (var accesoDatos = new AdministradorDispersion())
                {
                    string[] secciones = ConfiguracionApp.AdaptadorCloud.RecuperarString(RecursoNegocio.ParametroSeccionesIdC).Split('|');
                    string[] seccionesHistoricas = ConfiguracionApp.AdaptadorCloud.RecuperarString(RecursoNegocio.ParametroSeccionesHistoricasIdC).Split('|');
                    string[] t_relacion = new string[0];

                    string pathRelay = CacheConfiguracion.Instancia.ObtenerPathRelay(
                    RecursoAzureServiceBus.NombreCadenaIdCV2SB, RecursoNegocio.ParametroSBRutaIdCV2);

                    var canal = accesoDatos.ObtenerCanalBalanceadoSB<IConsultaIdCChannel>(RecursoAzureServiceBus.NombreCadenaIdCV2SB, pathRelay);

                    var response = canal.ObtenerDatosIdC(rfc, null, null, secciones, seccionesHistoricas, null, t_relacion, null, null, null, null);

                    datosGenerales = new DatosGenerales()
                    {
                        Rfc = response.DatosVigentes.RFC_Vigente,
                        PersonaId = response.DatosVigentes.personid,
                        BoId = response.DatosVigentes.boid,

                        Curp = response.DatosVigentes.Identificacion.CURP,
                        Nombre = response.DatosVigentes.Identificacion.Nombre,
                        ApellidoPaterno = response.DatosVigentes.Identificacion.Ap_Paterno,
                        ApellidoMaterno = response.DatosVigentes.Identificacion.Ap_Materno,
                        RazonSocial = response.DatosVigentes.Identificacion.Razon_Soc,
                        TipoSociedad = response.DatosVigentes.Identificacion.t_Sociedad,
                        TipoPersona = response.DatosVigentes.Identificacion.t_persona.Trim(),
                        Localizable = response.DatosVigentes.Identificacion.c_Sit_Cont_Dom,
                        EstatusContribuyente = response.DatosVigentes.Identificacion.c_Sit_Cont,

                        RfcRepresentante = response.DatosVigentes.Rep_Legales != null && response.DatosVigentes.Rep_Legales.Length > 0 ? response.DatosVigentes.Rep_Legales[0].RFC : string.Empty,
                        CurpRepresentante = response.DatosVigentes.Rep_Legales != null && response.DatosVigentes.Rep_Legales.Length > 0 ? response.DatosVigentes.Rep_Legales[0].CURP : string.Empty,
                        NombreRepresentante = response.DatosVigentes.Rep_Legales != null && response.DatosVigentes.Rep_Legales.Length > 0 ? response.DatosVigentes.Rep_Legales[0].Nombre : string.Empty,
                        ApellidoPaternoRepresentante = response.DatosVigentes.Rep_Legales != null && response.DatosVigentes.Rep_Legales.Length > 0 ? response.DatosVigentes.Rep_Legales[0].Ap_Paterno : string.Empty,
                        ApellidoMaternoRepresentante = response.DatosVigentes.Rep_Legales != null && response.DatosVigentes.Rep_Legales.Length > 0 ? response.DatosVigentes.Rep_Legales[0].Ap_Materno : string.Empty,

                        Alsc = response.DatosVigentes.Ubicacion != null ? response.DatosVigentes.Ubicacion.c_ALR : string.Empty,
                        EntidadFederativaVigente = response.DatosVigentes.Ubicacion != null ? response.DatosVigentes.Ubicacion.c_Ent_Fed : string.Empty,
                        EntidadFederativaHistorico = response.DatosHistoricos.Ubicacion != null ? response.DatosHistoricos.Ubicacion.c_Ent_Fed : string.Empty,

                        Regimenes = response.DatosVigentes.Regimenes != null && response.DatosVigentes.Regimenes.Length > 0 ?
                                    response.DatosVigentes.Regimenes.Select(p => new DatosRegimen()
                                    {
                                        ClaveRegimen = p.c_Regimen,
                                        NombreRegimen = p.d_Regimen,
                                        FechaInicioRegimen = p.f_Efec_A_Reg,
                                        FechaFinalRegimen = p.f_Efec_B_Reg
                                    }).ToArray() :
                                    new DatosRegimen[0],
                        RegimenesHistoricos = response.DatosHistoricos.RegimenesHistorico != null && response.DatosHistoricos.RegimenesHistorico.Length > 0 ?
                                              response.DatosHistoricos.RegimenesHistorico.Select(p => new DatosRegimen()
                                              {
                                                  ClaveRegimen = p.c_Regimen,
                                                  NombreRegimen = p.d_Regimen,
                                                  FechaInicioRegimen = p.f_Efec_A_Reg,
                                                  FechaFinalRegimen = p.f_Efec_B_Reg
                                              }).ToArray() :
                                              new DatosRegimen[0],

                        Roles = response.DatosVigentes.Roles != null && response.DatosVigentes.Roles.Length > 0 ?
                            response.DatosVigentes.Roles.Select(p => new DatosRol()
                            {
                                ClaveRol = p.c_Rol,
                                DescripcionRol = p.d_Rol,
                                TipoRol = p.d_Tipo,
                                FechaFinalRol = p.f_Baja_Rol,
                                FechaInicioRol = p.f_Alta_Rol

                            }).ToArray()
                            : new DatosRol[0],


                        RolesHistoricos = response.DatosHistoricos.RolesHistorico != null && response.DatosHistoricos.RolesHistorico.Length > 0 ?
                            response.DatosHistoricos.RolesHistorico.Select(p => new DatosRol()
                            {
                                ClaveRol = p.c_Rol,
                                DescripcionRol = p.d_Rol,
                                TipoRol = p.d_Tipo,
                                FechaFinalRol = p.f_Baja_Rol,
                                FechaInicioRol = p.f_Alta_Rol

                            }).ToArray()
                            : new DatosRol[0],

                        ClaveEntidad = response.DatosVigentes.Ubicacion != null ? response.DatosVigentes.Ubicacion.c_Ent_Fed : String.Empty,
                        ClaveMunicipio = response.DatosVigentes.Ubicacion != null ? response.DatosVigentes.Ubicacion.c_Municipio : String.Empty
                    };
                }

                if (datosGenerales != null)
                {
                    try
                    {
                        datosGenerales.Alsc = ObtenerAlsc(datosGenerales.Alsc);
                    }
                    catch (ExcepcionValidaInformacion exinv)
                    {
                        var ex = (Exception)exinv;
                        RegistroEvento.Error(ref ex, CodigoEvento.ErrorNegocio, "Precarga", origen: "Anuales.Descarga");
                    }
                    catch (Exception ex)
                    {
                        RegistroEvento.Error(ref ex, CodigoEvento.ErrorNegocio, "Precarga", origen: "Anuales.Descarga");
                    }

                }

                ValidarDatosIdc(datosGenerales);
            }

            catch (ExcepcionValidaInformacion exVI)
            {
                throw exVI;
            }
            catch (Exception e)
            {
                throw new ExcepcionConsultaIdc(e.Message, e);
            }

            return datosGenerales;
        }

        private DatosGenerales InvocarServicioIdCV3(string rfc)
        {
            DatosGenerales datosGenerales;
            try
            {

                string[] secciones = ConfiguracionApp.AdaptadorCloud.RecuperarString(RecursoNegocio.ParametroSeccionesIdC).Split('|');
                string[] seccionesHistoricas = ConfiguracionApp.AdaptadorCloud.RecuperarString(RecursoNegocio.ParametroSeccionesHistoricasIdC).Split('|');
                string[] t_relacion = new string[0];

                string usuarioIdC = ConfiguracionApp.AdaptadorCloud.RecuperarString(RecursoNegocio.ParametroUsuarioIdC);
                string passwordIdC = ConfiguracionApp.AdaptadorCloud.RecuperarString(RecursoNegocio.ParametroPasswordIdC);
                string usuarioIdCHistorico = ConfiguracionApp.AdaptadorCloud.RecuperarString(RecursoNegocio.ParametroUsuarioIdCHistorico);
                string passwordIdCHistorico = ConfiguracionApp.AdaptadorCloud.RecuperarString(RecursoNegocio.ParametroPasswordIdCHistorico);

                using (ServicioConsultaIdC servicio = new ServicioConsultaIdC())
                {
                    var response = servicio.ObtenerDatosIdC(rfc, null, null, secciones, seccionesHistoricas, null,
                        t_relacion, null, null, null, null, usuarioIdC, passwordIdC, usuarioIdCHistorico,
                        passwordIdCHistorico);

                    datosGenerales = new DatosGenerales()
                    {
                        Rfc = response.DatosVigentes.RFC_Vigente,
                        PersonaId = response.DatosVigentes.personid,
                        BoId = response.DatosVigentes.boid,

                        Curp = response.DatosVigentes.Identificacion.CURP,
                        Nombre = response.DatosVigentes.Identificacion.Nombre,
                        ApellidoPaterno = response.DatosVigentes.Identificacion.Ap_Paterno,
                        ApellidoMaterno = response.DatosVigentes.Identificacion.Ap_Materno,
                        RazonSocial = response.DatosVigentes.Identificacion.Razon_Soc,
                        TipoSociedad = response.DatosVigentes.Identificacion.t_Sociedad,
                        TipoPersona = response.DatosVigentes.Identificacion.t_persona.Trim(),

                        RfcRepresentante = response.DatosVigentes.Rep_Legales != null && response.DatosVigentes.Rep_Legales.Length > 0 ? response.DatosVigentes.Rep_Legales[0].RFC : string.Empty,
                        CurpRepresentante = response.DatosVigentes.Rep_Legales != null && response.DatosVigentes.Rep_Legales.Length > 0 ? response.DatosVigentes.Rep_Legales[0].CURP : string.Empty,
                        NombreRepresentante = response.DatosVigentes.Rep_Legales != null && response.DatosVigentes.Rep_Legales.Length > 0 ? response.DatosVigentes.Rep_Legales[0].Nombre : string.Empty,
                        ApellidoPaternoRepresentante = response.DatosVigentes.Rep_Legales != null && response.DatosVigentes.Rep_Legales.Length > 0 ? response.DatosVigentes.Rep_Legales[0].Ap_Paterno : string.Empty,
                        ApellidoMaternoRepresentante = response.DatosVigentes.Rep_Legales != null && response.DatosVigentes.Rep_Legales.Length > 0 ? response.DatosVigentes.Rep_Legales[0].Ap_Materno : string.Empty,

                        Alsc = response.DatosVigentes.Ubicacion != null ? response.DatosVigentes.Ubicacion.c_ALR : string.Empty,
                        EntidadFederativaVigente = response.DatosVigentes.Ubicacion != null ? response.DatosVigentes.Ubicacion.c_Ent_Fed : string.Empty,
                        EntidadFederativaHistorico = response.DatosHistoricos.Ubicacion != null ? response.DatosHistoricos.Ubicacion.c_Ent_Fed : string.Empty,

                        Regimenes = response.DatosVigentes.Regimenes != null && response.DatosVigentes.Regimenes.Length > 0 ?
                                    response.DatosVigentes.Regimenes.Select(p => new DatosRegimen()
                                    {
                                        ClaveRegimen = p.c_Regimen,
                                        NombreRegimen = p.d_Regimen,
                                        FechaInicioRegimen = p.f_Efec_A_Reg,
                                        FechaFinalRegimen = p.f_Efec_B_Reg
                                    }).ToArray() :
                                    new DatosRegimen[0],
                        RegimenesHistoricos = response.DatosHistoricos.RegimenesHistorico != null && response.DatosHistoricos.RegimenesHistorico.Length > 0 ?
                                              response.DatosHistoricos.RegimenesHistorico.Select(p => new DatosRegimen()
                                              {
                                                  ClaveRegimen = p.c_Regimen,
                                                  NombreRegimen = p.d_Regimen,
                                                  FechaInicioRegimen = p.f_Efec_A_Reg,
                                                  FechaFinalRegimen = p.f_Efec_B_Reg
                                              }).ToArray() :
                                              new DatosRegimen[0],

                        ClaveEntidad = response.DatosVigentes.Ubicacion != null ? response.DatosVigentes.Ubicacion.c_Ent_Fed : String.Empty,
                        ClaveMunicipio = response.DatosVigentes.Ubicacion != null ? response.DatosVigentes.Ubicacion.c_Municipio : String.Empty
                    };
                }
                if (datosGenerales != null)
                {
                    try
                    {
                        datosGenerales.Alsc = ObtenerAlsc(datosGenerales.Alsc);
                    }
                    catch (Exception ex)
                    {
                        RegistroEvento.Error(ref ex, CodigoEvento.ErrorNegocio, "Precarga", origen: "Anuales.Descarga");
                    }
                }

                ValidarDatosIdc(datosGenerales);
            }

            catch (ExcepcionValidaInformacion exVI)
            {
                throw exVI;
            }
            catch (Exception e)
            {
                throw new ExcepcionConsultaIdc(e.Message, e);
            }

            return datosGenerales;
        }
        
        void ObtieneTotales(string rfc, string ejercicio, string periodo, string opcionCalculoISR, string tipoDeclaracion, System.Globalization.CultureInfo cultureInfo, string consecutivo, out int codigoRespuesta, out XElement xRoot)
        {
            xRoot = new XElement("DatosIniciales");
            if (ejecutaAccion != null)
            {
               

                try
                {
                    dynamic totales = ejecutaAccion(new string[]{ rfc, ejercicio, periodo, consecutivo }, accion.Totales);

                    string resultTotales = JsonConvert.SerializeObject(totales);
                    RegistroEvento.Informacion("Respuesta Totales: " + resultTotales, CodigoEvento.AdvertenciaDatos, "Sat.DeclaracionesAnueles.Descarga",
                        "ejecutaAccion(" + rfc + ", " + ejercicio.ToString() + ", " + periodo + ", " + consecutivo + ");", rfc,
                        ConfiguracionApp.AdaptadorCloud.RecuperarFechaFormatoISO());

                    if (totales != null)
                    {
                        var lxe = new List<XElement>();
                        double Egresos = totales.Egresos.Pagados.MontoADeducir + totales.NominaMonto + totales.CoutasIMSSMonto;
                        //if (opcionCalculoISR == "0")
                        //{
                            lxe.Add(new XElement("IngresosCobrados", new XAttribute("claveInformativa", "12031002")) { Value = RedondeaCantidad(totales.Ingresos.Cobrados.Total.ToString("N2", cultureInfo), cultureInfo) });
                            lxe.Add(new XElement("ComprasYGastos", new XAttribute("claveInformativa", "T12031005")) { Value = RedondeaCantidad(Egresos.ToString("N2", cultureInfo), cultureInfo) });
                            lxe.Add(new XElement("EstimuloFiscal", new XAttribute("claveInformativa", "T12031012")) { Value = RedondeaCantidad(totales.Egresos.Pagados.DeduccionInmediata.ToString("N2", cultureInfo), cultureInfo) });
                            lxe.Add(new XElement("ImpuestoRetenido", new XAttribute("claveInformativa", "12031019")) { Value = RedondeaCantidad(totales.Ingresos.Cobrados.ImpuestoRetenidoISR.ToString("N2", cultureInfo), cultureInfo) });
                        //}
                        //else
                        //{
                            //lxe.Add(new XElement("IngresosCobrados", new XAttribute("claveInformativa", "12031002")) { Value = RedondeaCantidad(totales.Ingresos.Cobrados.Total.ToString("N2", cultureInfo), cultureInfo) });
                            //lxe.Add(new XElement("ImpuestoRetenido", new XAttribute("claveInformativa", "12031019")) { Value = RedondeaCantidad(totales.Ingresos.Cobrados.ImpuestoRetenidoISR.ToString("N2", cultureInfo), cultureInfo) });
                        //}

                        lxe.Add(new XElement("PeriodoQueDeclara", new XAttribute("claveInformativa", "IECPD")) { Value = RedondeaCantidad(totales.Ingresos.Cobrados.Total.ToString("N2", cultureInfo), cultureInfo) });
                        lxe.Add(new XElement("IVAcobrado", new XAttribute("claveInformativa", "12031104")) { Value = RedondeaCantidad(totales.Ingresos.Cobrados.ImpuestoTrasladadoIVA.ToString("N2", cultureInfo), cultureInfo) });
                        lxe.Add(new XElement("IVAAcreditable", new XAttribute("claveInformativa", "12031105")) { Value = RedondeaCantidad(totales.Egresos.Pagados.ImpuestoTrasladadoIVA.ToString("N2", cultureInfo), cultureInfo) });
                        lxe.Add(new XElement("IVARetenido", new XAttribute("claveInformativa", "12031108")) { Value = RedondeaCantidad(totales.Ingresos.Cobrados.ImpuestoRetenidoIVA.ToString("N2", cultureInfo), cultureInfo) });

                        xRoot.Add(lxe);
                    }
                }
                catch (Exception e)
                {
                    ExcepcionGeneral ex = new ExcepcionGeneral(string.Format("Error en el servicio de Consulta de Totales (Clasificador): {0}", "ejecutaAccion(" + rfc + ", " + ejercicio + ", " 
                        + periodo + ", " + consecutivo + ");"), e);
                    RegistroEvento.Error(ex, CodigoEvento.ErrorNegocio, GetType().Name,
                             rfc, tipoDeclaracion, "", ejercicio,
                             fechaRegistro: ConfiguracionApp.AdaptadorCloud.RecuperarFechaFormatoISO());

                    codigoRespuesta = (int)CodigoRespuestaGeneral.Error;
                    throw ex;
                }
            }
            codigoRespuesta = (int)CodigoRespuestaGeneral.OK;
        }

        string RedondeaCantidad(string dbl, System.Globalization.CultureInfo ci)
        {
            string decimales = dbl.Substring(dbl.IndexOf('.'));

            if (decimal.Parse(decimales, ci) >= decimal.Parse("0.51", ci))
            {
                return Math.Ceiling(decimal.Parse(dbl, ci)).ToString();
            }
            else
            {
                return Math.Floor(decimal.Parse(dbl, ci)).ToString();
            }
        }

        void ObtieneAcumulados(ref string strXML, string rfc, string ejercicio, string periodo, string clavePeriodicidad, string tipoDeclaracion, string postParam, out int codigoRespuesta)
        {
            bool es1erPeriodo = false;
            switch (clavePeriodicidad)
            {
                case "M":
                    es1erPeriodo = periodo.Equals("001");
                    break;
            }

            try
            {
                if (!es1erPeriodo)
                {
                    string param = DeclaracionDatos != null
                        ? DeclaracionDatos(postParam, "POST",
                                 ConfiguracionApp.AdaptadorCloud.RecuperarCadena("DeclaracionAcumulados"))
                        : "";

                    if (!string.IsNullOrEmpty(param))
                    {
                        var xresult = XDocument.Parse(strXML);
                        dynamic parametro = JsonConvert.DeserializeObject(param);

                        var scampo = new string[] { "SAT_107|12031001", "SAT_12031004|12031004" };
                        foreach (var p in parametro.Contenido.Acumulados)
                        {
                            string claveInformativa = scampo.Where(c => p.Campo.ToString().Contains(c.Split('|')[0]))
                                                        .FirstOrDefault();

                            if (!string.IsNullOrEmpty(claveInformativa))
                            {
                                var xe = new XElement(claveInformativa.Split('|')[0], new XAttribute("claveInformativa",
                                        claveInformativa.Split('|')[1]));
                                xe.Value = p.MontoFormulario.ToString();
                                xresult.Element("DatosContribuyente").LastNode.AddAfterSelf(xe);
                            }
                        }

                        strXML = xresult.ToString();
                    }
                }
            }
            catch (Exception e)
            {
                ExcepcionGeneral ex = new ExcepcionGeneral(string.Format("Error en el servicio de Consulta de DyP: {0}", postParam), e);
                RegistroEvento.Error(ex, CodigoEvento.ErrorNegocio, GetType().Name,
                         rfc, tipoDeclaracion, "", ejercicio,
                         fechaRegistro: ConfiguracionApp.AdaptadorCloud.RecuperarFechaFormatoISO());

                codigoRespuesta = (int)CodigoRespuestaGeneral.Error;
                throw ex;
            }
            codigoRespuesta = (int)CodigoRespuestaGeneral.OK;
        }

        public void GuardarDatosIdC(DatosGenerales datosGenerales)
        {
            using (AdministradorDeclaracion declaracion = new AdministradorDeclaracion())
            {
                declaracion.CrearActualizarRegistroIdC(datosGenerales.Rfc, JsonConvert.SerializeObject(datosGenerales));
            }
        }

        public bool ValidarAccesoSISE(string rfcContribuyente, string rfcEmpleado, string ip, Aplicacion aplicacion)
        {
            bool resultado = false;

            //"<CONSULTA><INFORMACION><D_RFC>VCLL601027F52</D_RFC><C_SISTEMA>25</C_SISTEMA><C_MODULO>1</C_MODULO></INFORMACION><CREDENCIAL><D_LOGIN>VIDA80AV</D_LOGIN><D_DIRECCIONIP>99.90.28.161</D_DIRECCIONIP><D_MAC>74-DE-2B-C9-B3-55</D_MAC></CREDENCIAL></CONSULTA>";
            string cadena = String.Format(RecursoNegocio.CadenaXmlConsultaSISE, rfcContribuyente, aplicacion.ToDescription(), RecursoNegocio.ModuloConsultaSISE, rfcEmpleado, ip);

            CategoriaAuditoria categoria;
            string mensaje = String.Empty;

            using (WSSiseSoapClient cliente = new WSSiseSoapClient())
            {
                int valor = cliente.Fn_VerInformacion(cadena);

                if (Enum.TryParse(valor.ToString(), out categoria))
                {
                    if (categoria == CategoriaAuditoria.InformativoVerde)
                    {
                        mensaje = String.Format(RecursoNegocio.MensajeConsultaSISE, rfcEmpleado, rfcContribuyente);
                        resultado = true;
                    }
                    else
                    {
                        mensaje = String.Format(RecursoMensajeError.ErrorValidacionSISE, rfcEmpleado, rfcContribuyente);
                    }
                }
            }

            this.RegistrarPistaAuditoriaSISE(rfcContribuyente, rfcEmpleado, ip, aplicacion, categoria, mensaje);

            return resultado;
        }

        private void RegistrarPistaAuditoriaSISE(string rfcContribuyente, string rfcEmpleado, string ip, Aplicacion aplicacion, CategoriaAuditoria categoria, string mensaje)
        {
            PistaAuditoria pista = new PistaAuditoria()
            {
                PartitionKey = ConfiguracionApp.AdaptadorCloud.RecuperarFechaFormatoPartition(),
                RowKey = Guid.NewGuid().ToString(),
                Ip = ip,
                Usuario = rfcContribuyente,
                Aplicacion = aplicacion.ToDescription(),
                Modulo = RecursoNegocio.ModuloConsultaSISE,
                FechaModificacion = ConfiguracionApp.AdaptadorCloud.RecuperarFecha(),
                Categoria = (int)categoria,
                Mensaje = mensaje,
                Evento = EventoAuditoria.Consultar.ToDescription()
            };

            using (AdministradorPerfiles admin = new AdministradorPerfiles())
            {
                admin.AgregarEntidad(RecursoAzureTable.TablaAzurePistaAuditoria, pista);
            }
        }

        #region Implementation of IDisposable

        private bool _isDisposed;

        /// <summary>
        /// Performs application-defined tasks associated with freeing, releasing, or resetting unmanaged resources.
        /// </summary>
        /// <filterpriority>2</filterpriority>
        public void Dispose()
        {
            if (_isDisposed)
            {
                return;
            }

            _isDisposed = true;
            GC.SuppressFinalize(this);
        }

        #endregion
    }
}
