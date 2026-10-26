# Product — Lavía
<!-- impeccable:product-schema 1 -->
## Platform
web
## Users
Propietarios, gerencia, recepción y profesionales de salones; clientes que reservan mediante el portal público; administradores de plataforma. Confirmado en el proyecto y en los encargos del usuario.
## Product Purpose
SaaS multiempresa para gestionar la agenda, servicios y clientes de salones, con página de reservas propia y simulaciones de cabello basadas en trabajos del negocio.
## Operating Context
Monorepo Angular/Ionic/NestJS, Docker Compose en el VPS propio. Las operaciones financieras registran cobros recibidos; no ejecutan cargos bancarios. El usuario ha autorizado avanzar en estudio de IA y gestión económica, conservando datos y fotos.
## Capabilities and Constraints
Permisos por salón y rol, fotos privadas, consentimiento e IA externa por Replicate pendiente de clave. Caja por sede, moneda y día; comisiones sobre cobros netos registrados, sin conversión de monedas ni gestión de nómina. La calidad de IA real requiere proveedor y evaluación humana; las pruebas sintéticas no se presentan como resultados reales.
## Brand Commitments
Lavía y el sistema actual de design.md; aplicar el mismo sistema en los módulos nuevos.
## Product Principles
Preservar historial, separar datos de salones, distinguir cobrado de valor de citas y simulado de validado por un profesional. No fabricar métricas o resultados.
