/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19-11.4.10-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: localhost    Database: f3_production
-- ------------------------------------------------------
-- Server version	11.4.10-MariaDB-ubu2404

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*M!100616 SET @OLD_NOTE_VERBOSITY=@@NOTE_VERBOSITY, NOTE_VERBOSITY=0 */;

--
-- Table structure for table `airplanes`
--

DROP TABLE IF EXISTS `airplanes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `airplanes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `serial_number` varchar(50) NOT NULL,
  `model` varchar(100) NOT NULL,
  `status` enum('draft','in_progress','qc_review','completed') NOT NULL DEFAULT 'draft',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `completed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `serial_number` (`serial_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `airplanes`
--

LOCK TABLES `airplanes` WRITE;
/*!40000 ALTER TABLE `airplanes` DISABLE KEYS */;
/*!40000 ALTER TABLE `airplanes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `customer_logs`
--

DROP TABLE IF EXISTS `customer_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `customer_id` int(11) NOT NULL,
  `date_time` datetime NOT NULL,
  `employee_id` int(11) DEFAULT NULL,
  `employee_name` varchar(255) DEFAULT NULL,
  `contact_type` enum('email','phone_call','whatsapp','sms','instagram','facebook','meeting','event','internal_note','other') DEFAULT 'other',
  `category` enum('sales','support','service','problem','delivery','warranty','general_question','other') DEFAULT 'other',
  `title` varchar(255) NOT NULL,
  `detailed_notes` text DEFAULT NULL,
  `customer_question` text DEFAULT NULL,
  `blackwing_answer` text DEFAULT NULL,
  `follow_up_needed` tinyint(1) NOT NULL DEFAULT 0,
  `follow_up_date` date DEFAULT NULL,
  `follow_up_responsible` varchar(255) DEFAULT NULL,
  `entry_status` enum('open','waiting_customer','waiting_blackwing','solved','closed') DEFAULT 'open',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `customer_id` (`customer_id`),
  KEY `employee_id` (`employee_id`),
  CONSTRAINT `customer_logs_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `customer_logs_ibfk_2` FOREIGN KEY (`employee_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customer_logs`
--

LOCK TABLES `customer_logs` WRITE;
/*!40000 ALTER TABLE `customer_logs` DISABLE KEYS */;
INSERT INTO `customer_logs` VALUES
(1,1,'2026-05-21 02:30:00',NULL,'Administrator','phone_call','sales','Phone call — delivery time and avionics options','Called John to follow up after AERO. He is seriously considering the 650 and wants to know the expected delivery date and available avionics configurations.','What is the current lead time for a new 650? Can we get the full Garmin G3X Touch glass cockpit with GFC 500 autopilot? What is included in the standard package vs. optional?','Explained that current production slot is approximately 18 months from contract signing. Confirmed full Garmin G3X Touch cockpit is available as standard on new builds. GFC 500 autopilot is optional but strongly recommended. Sent him the current configurator PDF and price list by email.',1,'2026-05-28','Administrator','open','2026-05-23 10:41:21','2026-05-24 15:31:05');
/*!40000 ALTER TABLE `customer_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `customer_quote_options`
--

DROP TABLE IF EXISTS `customer_quote_options`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_quote_options` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `quote_id` int(11) NOT NULL,
  `option_id` int(11) DEFAULT NULL,
  `option_label` varchar(200) NOT NULL,
  `option_category` varchar(100) NOT NULL,
  `option_price` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `quote_id` (`quote_id`),
  KEY `option_id` (`option_id`),
  CONSTRAINT `customer_quote_options_ibfk_1` FOREIGN KEY (`quote_id`) REFERENCES `customer_quotes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `customer_quote_options_ibfk_2` FOREIGN KEY (`option_id`) REFERENCES `fleet_config_options` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customer_quote_options`
--

LOCK TABLES `customer_quote_options` WRITE;
/*!40000 ALTER TABLE `customer_quote_options` DISABLE KEYS */;
INSERT INTO `customer_quote_options` VALUES
(5,2,1,'Rotax 916iS','Engine',37999.00),
(6,2,2,'E-Props Glorieuse C9','Propeller',6999.00);
/*!40000 ALTER TABLE `customer_quote_options` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `customer_quotes`
--

DROP TABLE IF EXISTS `customer_quotes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_quotes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `customer_id` int(11) NOT NULL,
  `model_id` int(11) DEFAULT NULL,
  `model_name` varchar(120) DEFAULT NULL,
  `title` varchar(200) DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'draft',
  `notes` text DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `vat_rate` decimal(5,2) NOT NULL DEFAULT 20.00,
  PRIMARY KEY (`id`),
  KEY `customer_id` (`customer_id`),
  KEY `model_id` (`model_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `customer_quotes_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `customer_quotes_ibfk_2` FOREIGN KEY (`model_id`) REFERENCES `fleet_models` (`id`) ON DELETE SET NULL,
  CONSTRAINT `customer_quotes_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customer_quotes`
--

LOCK TABLES `customer_quotes` WRITE;
/*!40000 ALTER TABLE `customer_quotes` DISABLE KEYS */;
INSERT INTO `customer_quotes` VALUES
(2,1,4,'BW650','Test','draft','aaa',1,'2026-05-24 19:07:42','2026-05-24 19:12:05',25.00);
/*!40000 ALTER TABLE `customer_quotes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `customers`
--

DROP TABLE IF EXISTS `customers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `customers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `full_name` varchar(255) NOT NULL,
  `company_name` varchar(255) DEFAULT NULL,
  `country` varchar(100) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `phone` varchar(100) DEFAULT NULL,
  `preferred_language` varchar(50) DEFAULT NULL,
  `source` enum('website','email','phone','instagram','facebook','aero','dealer','existing_customer','referral','other') DEFAULT 'other',
  `interested_aircraft` varchar(255) DEFAULT NULL,
  `customer_type` enum('new_buyer','existing_owner','dealer','service_customer','other') DEFAULT 'new_buyer',
  `status` enum('new','contacted','waiting_reply','active_discussion','quote_sent','test_flight_planned','problem_support','closed_won','closed_lost','future_prospect') DEFAULT 'new',
  `priority` enum('low','medium','high','urgent') DEFAULT 'medium',
  `assigned_employee_id` int(11) DEFAULT NULL,
  `general_notes` text DEFAULT NULL,
  `archived` tinyint(1) NOT NULL DEFAULT 0,
  `last_contact_date` datetime DEFAULT NULL,
  `next_followup_date` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `assigned_employee_id` (`assigned_employee_id`),
  CONSTRAINT `customers_ibfk_1` FOREIGN KEY (`assigned_employee_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customers`
--

LOCK TABLES `customers` WRITE;
/*!40000 ALTER TABLE `customers` DISABLE KEYS */;
INSERT INTO `customers` VALUES
(1,'John Smith',NULL,'Germany','Munich','john.smith@example.com','+49 89 555 0123','English','aero','BW650','new_buyer','active_discussion','high',1,'Met at AERO Friedrichshafen. Very interested in the 650 with full Garmin package.',0,'2026-05-23 12:46:00','2026-05-28','2026-05-23 10:41:21','2026-05-24 19:12:23');
/*!40000 ALTER TABLE `customers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fleet_aircraft`
--

DROP TABLE IF EXISTS `fleet_aircraft`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_aircraft` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `fleet_number` int(11) NOT NULL,
  `bw_serial` varchar(50) NOT NULL,
  `aircraft_number` varchar(50) DEFAULT NULL,
  `model` varchar(100) NOT NULL,
  `build_status` enum('in_production','completed','delivered','in_service','stored','for_sale','written_off') NOT NULL DEFAULT 'in_production',
  `registration` varchar(20) DEFAULT NULL,
  `country_code` char(2) DEFAULT NULL,
  `country_name` varchar(100) DEFAULT NULL,
  `empty_weight_kg` decimal(8,2) DEFAULT NULL,
  `useful_load_kg` decimal(8,2) DEFAULT NULL,
  `airworthiness_status` enum('active','expired','pending','unknown') DEFAULT NULL,
  `airworthiness_authority` varchar(100) DEFAULT NULL,
  `airworthiness_expiry` date DEFAULT NULL,
  `config_engine` varchar(200) DEFAULT NULL,
  `config_prop` varchar(200) DEFAULT NULL,
  `config_avionics` text DEFAULT NULL,
  `config_interior` text DEFAULT NULL,
  `config_paint` varchar(200) DEFAULT NULL,
  `total_hours_tsn` decimal(8,2) DEFAULT NULL,
  `engine_hours` decimal(8,2) DEFAULT NULL,
  `prop_hours` decimal(8,2) DEFAULT NULL,
  `next_inspection_date` date DEFAULT NULL,
  `next_inspection_hours` decimal(8,2) DEFAULT NULL,
  `customer_name` varchar(200) DEFAULT NULL,
  `first_flight_date` date DEFAULT NULL,
  `delivery_date` date DEFAULT NULL,
  `financing_flag` tinyint(1) NOT NULL DEFAULT 0,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `nose_wheel_weight` decimal(8,2) DEFAULT NULL,
  `left_wheel_weight` decimal(8,2) DEFAULT NULL,
  `right_wheel_weight` decimal(8,2) DEFAULT NULL,
  `serviced_by_us` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `fleet_number` (`fleet_number`)
) ENGINE=InnoDB AUTO_INCREMENT=41 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fleet_aircraft`
--

LOCK TABLES `fleet_aircraft` WRITE;
/*!40000 ALTER TABLE `fleet_aircraft` DISABLE KEYS */;
INSERT INTO `fleet_aircraft` VALUES
(1,1,'032','032','BW650','delivered','SE-LRS','FR','France',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Claude',NULL,NULL,0,NULL,'2026-05-05 17:34:55','2026-05-05 18:32:49',NULL,NULL,NULL,0),
(2,2,'007','007','BW635RG','delivered','SE-MMD','DK','Denmark',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,'2026-05-05 17:38:10','2026-05-05 18:32:56',NULL,NULL,NULL,0),
(3,3,'040','040','BW650','delivered','SE-MNV','SE','Sweden',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Blackwing Sweden AB',NULL,NULL,0,NULL,'2026-05-05 18:25:41','2026-05-05 18:32:42',NULL,NULL,NULL,0),
(4,4,'042','042','BW650','delivered','SE-MNO','BE','Belgium',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Altiaero',NULL,NULL,0,NULL,'2026-05-05 18:29:44','2026-05-05 18:44:59',NULL,NULL,NULL,0),
(5,5,'037','037','BW650','delivered','D-MJBW','DE','Germany',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,'2026-05-05 18:34:13','2026-05-05 18:34:30',NULL,NULL,NULL,0),
(6,6,'017','017','BW600','delivered','F-JISF','FR','France',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,'2026-05-05 18:39:33','2026-05-05 18:56:18',NULL,NULL,NULL,0),
(7,7,'041','041','BW650','delivered','D-MTLG','DE','Germany',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Zeitmachine',NULL,NULL,0,NULL,'2026-05-05 18:40:56','2026-05-05 18:57:02',NULL,NULL,NULL,0),
(8,8,'025','025','BW600','delivered','F-JKYS','FR','France',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,'2026-05-05 18:42:05','2026-05-05 18:56:25',NULL,NULL,NULL,0),
(9,9,'034','034','BW650','delivered','SE-MOJ','SE','Sweden',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Håkan',NULL,NULL,0,NULL,'2026-05-05 18:43:31','2026-05-05 18:56:42',NULL,NULL,NULL,0),
(10,10,'029','029','BW650','delivered','SE-MMK','BE','Belgium',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Altiaero',NULL,NULL,0,NULL,'2026-05-05 18:44:36','2026-05-05 18:56:34',NULL,NULL,NULL,0),
(11,11,'035','035','BW650','delivered','D-MAAA','DE','Germany',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Franz',NULL,NULL,0,NULL,'2026-05-05 18:47:08','2026-05-05 18:56:48',NULL,NULL,NULL,0),
(12,12,'038','038','BW650','delivered','SE-MOR','SE','Sweden',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Isak',NULL,NULL,0,NULL,'2026-05-05 18:50:16','2026-05-05 18:56:55',NULL,NULL,NULL,0),
(13,13,'014','014','BW600','delivered','OY-9977','DK','Denmark',370.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,'2026-05-05 18:52:53','2026-05-06 13:47:16',100.00,135.00,135.00,0),
(14,14,'016','016','BW600','delivered','D-MVBW','DE','Germany',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,'2026-05-05 18:54:27','2026-05-05 18:56:12',NULL,NULL,NULL,0),
(15,15,'010','010','BW600','delivered','SE-VVG','SE','Sweden',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,'2026-05-05 18:55:44','2026-05-05 18:55:58',NULL,NULL,NULL,0),
(16,16,'006','006','BW600','delivered','D-MPMM','DE','Germany',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,'2026-05-05 18:58:25','2026-05-05 18:58:29',NULL,NULL,NULL,0),
(17,17,'002','002','BW600','delivered','SE-VUE','SE','Sweden',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,'2026-05-05 19:01:28','2026-05-05 19:01:36',NULL,NULL,NULL,0),
(18,18,'011','011','BW600','delivered','PH-4U5','NL','Netherlands',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,'2026-05-05 19:03:44','2026-05-05 19:03:50',NULL,NULL,NULL,0),
(19,19,'015','015','BW600','delivered','F-JILW','FR','France',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,'2026-05-05 19:04:51','2026-05-05 19:04:56',NULL,NULL,NULL,0),
(20,20,'012','012','BW600','delivered','SE-VVO','SE','Sweden',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,'2026-05-05 19:05:34','2026-05-05 19:05:38',NULL,NULL,NULL,0),
(21,21,'039','039','BW650','delivered','D-MKCW','DE','Germany',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,24.90,24.90,NULL,NULL,NULL,'Christian Weikein','2025-09-18','2025-10-17',0,NULL,'2026-05-06 13:35:08','2026-05-24 21:07:57',NULL,NULL,NULL,0),
(22,22,'044','044','BW650','in_production','SE-LML','SE','Sweden',379.20,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,6.00,6.00,NULL,NULL,NULL,'Asmus',NULL,NULL,0,NULL,'2026-05-06 13:36:18','2026-05-24 21:08:34',99.70,141.40,138.10,0),
(23,23,'008','008','BW600','delivered','F-JGCW','FR','France',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,'2026-05-06 18:31:56','2026-05-06 18:32:02',NULL,NULL,NULL,0),
(24,24,'009','009','BW600','delivered','D-MCYP','DE','Germany',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2019-09-18','2019-11-07',0,NULL,'2026-05-06 18:32:42','2026-05-06 18:33:35',NULL,NULL,NULL,0),
(25,25,'018','018','BW635RG','delivered','D-MPCR','DE','Germany',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Olfert','2022-06-22','2022-09-09',0,NULL,'2026-05-06 18:35:14','2026-05-06 18:35:47',NULL,NULL,NULL,0),
(26,26,'019','019','BW635RG','delivered','SE-MCE','AT','Austria',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2022-07-14','2023-03-06',0,NULL,'2026-05-06 18:36:43','2026-05-06 18:37:57',NULL,NULL,NULL,0),
(27,27,'020','020','BW635RG','delivered','D-MSKV','DE','Germany',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,'2026-05-06 18:39:16','2026-05-06 18:39:21',NULL,NULL,NULL,0),
(28,28,'021','021','BW635RG','delivered','D-MSMP','DE','Germany',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2023-03-08','2023-05-17',0,NULL,'2026-05-06 18:43:28','2026-05-07 16:36:18',NULL,NULL,NULL,0),
(29,29,'022','022','BW635RG','delivered','OM-M540','SK','Slovakia',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2023-04-03','2023-05-17',0,NULL,'2026-05-06 18:45:04','2026-05-06 18:45:40',NULL,NULL,NULL,0),
(30,30,'023','023','BW600','delivered','F-JKKN','FR',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2023-06-12','2023-07-25',0,NULL,'2026-05-06 18:47:17','2026-05-06 18:47:42',NULL,NULL,NULL,0),
(31,31,'024','024','BW600','delivered','F-JKPE','FR','France',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2023-07-12','2024-02-29',0,NULL,'2026-05-06 18:48:45','2026-05-06 18:49:17',NULL,NULL,NULL,0),
(32,32,'027','027','BW635RG','delivered','D-MDMJ','DE','Germany',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2024-06-13','2024-07-12',0,NULL,'2026-05-06 18:50:07','2026-05-07 05:46:31',NULL,NULL,NULL,0),
(33,33,'026','026','BW635RG','delivered','LZ-EBM','BG','Bulgaria',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2024-03-27','2024-05-16',0,NULL,'2026-05-06 18:51:58','2026-05-06 18:52:25',NULL,NULL,NULL,0),
(34,34,'028','028','BW635RG','delivered','D-MLGL','DE','Germany',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2024-10-17','2025-03-26',0,NULL,'2026-05-06 19:06:31','2026-05-06 19:07:03',NULL,NULL,NULL,0),
(35,35,'030','030','BW635RG','delivered','D-MZBW','DE','Germany',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2024-09-24','2024-10-02',0,NULL,'2026-05-06 19:07:37','2026-05-06 19:08:05',NULL,NULL,NULL,0),
(36,36,'031','031','BW635RG','delivered','D-MRBW','DE','Germany',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2025-01-31','2025-02-26',0,NULL,'2026-05-06 19:08:39','2026-05-06 19:09:00',NULL,NULL,NULL,0),
(37,37,'033','033','BW650','delivered','SE-MNX','SE','Sweden',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Skovly','2025-04-09',NULL,0,NULL,'2026-05-06 19:09:48','2026-05-06 19:12:04',NULL,NULL,NULL,0),
(38,38,'036','036','BW650','delivered','SE-MNL','BE','Belgium',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Altiaero','2026-01-14',NULL,0,NULL,'2026-05-06 19:11:19','2026-05-06 19:11:42',NULL,NULL,NULL,0),
(39,39,'003','003','BW600','delivered','SE-VVB','SE','Sweden',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2018-01-01',NULL,0,NULL,'2026-05-07 05:48:06','2026-05-07 05:48:36',NULL,NULL,NULL,0),
(40,40,'005','005','BW600','delivered','SE-VVD','SE','Sweden',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,'2026-05-07 16:14:51','2026-05-07 16:14:58',NULL,NULL,NULL,0);
/*!40000 ALTER TABLE `fleet_aircraft` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fleet_aircraft_config`
--

DROP TABLE IF EXISTS `fleet_aircraft_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_aircraft_config` (
  `aircraft_id` int(11) NOT NULL,
  `option_id` int(11) NOT NULL,
  PRIMARY KEY (`aircraft_id`,`option_id`),
  KEY `option_id` (`option_id`),
  CONSTRAINT `fleet_aircraft_config_ibfk_1` FOREIGN KEY (`aircraft_id`) REFERENCES `fleet_aircraft` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fleet_aircraft_config_ibfk_2` FOREIGN KEY (`option_id`) REFERENCES `fleet_config_options` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fleet_aircraft_config`
--

LOCK TABLES `fleet_aircraft_config` WRITE;
/*!40000 ALTER TABLE `fleet_aircraft_config` DISABLE KEYS */;
/*!40000 ALTER TABLE `fleet_aircraft_config` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fleet_bulletin_aircraft`
--

DROP TABLE IF EXISTS `fleet_bulletin_aircraft`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_bulletin_aircraft` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `bulletin_id` int(11) NOT NULL,
  `aircraft_id` int(11) NOT NULL,
  `serial_id` int(11) DEFAULT NULL,
  `status` enum('open','resolved') NOT NULL DEFAULT 'open',
  `resolution_notes` text DEFAULT NULL,
  `resolved_extra_work` text DEFAULT NULL,
  `labor_hours` decimal(8,2) DEFAULT NULL,
  `signed_off_by` varchar(120) DEFAULT NULL,
  `resolved_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_bulletin_aircraft` (`bulletin_id`,`aircraft_id`,`serial_id`),
  KEY `aircraft_id` (`aircraft_id`),
  KEY `serial_id` (`serial_id`),
  CONSTRAINT `fleet_bulletin_aircraft_ibfk_1` FOREIGN KEY (`bulletin_id`) REFERENCES `fleet_bulletins` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fleet_bulletin_aircraft_ibfk_2` FOREIGN KEY (`aircraft_id`) REFERENCES `fleet_aircraft` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fleet_bulletin_aircraft_ibfk_3` FOREIGN KEY (`serial_id`) REFERENCES `fleet_serial_numbers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fleet_bulletin_aircraft`
--

LOCK TABLES `fleet_bulletin_aircraft` WRITE;
/*!40000 ALTER TABLE `fleet_bulletin_aircraft` DISABLE KEYS */;
INSERT INTO `fleet_bulletin_aircraft` VALUES
(1,1,3,NULL,'open',NULL,NULL,NULL,NULL,NULL,'2026-05-22 17:25:48'),
(2,1,4,NULL,'open',NULL,NULL,NULL,NULL,NULL,'2026-05-22 17:25:48'),
(3,1,7,NULL,'open',NULL,NULL,NULL,NULL,NULL,'2026-05-22 17:25:48'),
(4,1,21,NULL,'open',NULL,NULL,NULL,NULL,NULL,'2026-05-22 17:25:48'),
(5,1,22,NULL,'open',NULL,NULL,NULL,NULL,NULL,'2026-05-22 17:25:48');
/*!40000 ALTER TABLE `fleet_bulletin_aircraft` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fleet_bulletin_config_options`
--

DROP TABLE IF EXISTS `fleet_bulletin_config_options`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_bulletin_config_options` (
  `bulletin_id` int(11) NOT NULL,
  `option_id` int(11) NOT NULL,
  PRIMARY KEY (`bulletin_id`,`option_id`),
  KEY `option_id` (`option_id`),
  CONSTRAINT `fleet_bulletin_config_options_ibfk_1` FOREIGN KEY (`bulletin_id`) REFERENCES `fleet_bulletins` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fleet_bulletin_config_options_ibfk_2` FOREIGN KEY (`option_id`) REFERENCES `fleet_config_options` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fleet_bulletin_config_options`
--

LOCK TABLES `fleet_bulletin_config_options` WRITE;
/*!40000 ALTER TABLE `fleet_bulletin_config_options` DISABLE KEYS */;
INSERT INTO `fleet_bulletin_config_options` VALUES
(1,1);
/*!40000 ALTER TABLE `fleet_bulletin_config_options` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fleet_bulletins`
--

DROP TABLE IF EXISTS `fleet_bulletins`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_bulletins` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(200) NOT NULL,
  `component_type` varchar(120) DEFAULT NULL,
  `component_name` varchar(180) DEFAULT NULL,
  `serial_prefix` varchar(120) DEFAULT NULL,
  `details` text DEFAULT NULL,
  `status` enum('open','closed') NOT NULL DEFAULT 'open',
  `created_by` int(11) DEFAULT NULL,
  `closed_by` int(11) DEFAULT NULL,
  `closed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `category` enum('mandatory','obligatory','recommended','optional') NOT NULL DEFAULT 'optional',
  `reason` text DEFAULT NULL,
  `what_to_do` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `created_by` (`created_by`),
  KEY `closed_by` (`closed_by`),
  CONSTRAINT `fleet_bulletins_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fleet_bulletins_ibfk_2` FOREIGN KEY (`closed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fleet_bulletins`
--

LOCK TABLES `fleet_bulletins` WRITE;
/*!40000 ALTER TABLE `fleet_bulletins` DISABLE KEYS */;
INSERT INTO `fleet_bulletins` VALUES
(1,'Rotax 916iS Generator Fault',NULL,NULL,NULL,NULL,'open',1,NULL,NULL,'2026-05-22 17:25:48','mandatory','Generator burns up.','Change it');
/*!40000 ALTER TABLE `fleet_bulletins` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fleet_config_options`
--

DROP TABLE IF EXISTS `fleet_config_options`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_config_options` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `category` varchar(100) NOT NULL,
  `label` varchar(200) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `is_standard` tinyint(1) NOT NULL DEFAULT 0,
  `price` decimal(10,2) DEFAULT NULL,
  `show_in_configurator` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fleet_config_options`
--

LOCK TABLES `fleet_config_options` WRITE;
/*!40000 ALTER TABLE `fleet_config_options` DISABLE KEYS */;
/*!40000 ALTER TABLE `fleet_config_options` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fleet_contacts`
--

DROP TABLE IF EXISTS `fleet_contacts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_contacts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `aircraft_id` int(11) NOT NULL,
  `name` varchar(200) NOT NULL,
  `role` varchar(100) DEFAULT NULL,
  `email` varchar(200) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `aircraft_id` (`aircraft_id`),
  CONSTRAINT `fleet_contacts_ibfk_1` FOREIGN KEY (`aircraft_id`) REFERENCES `fleet_aircraft` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fleet_contacts`
--

LOCK TABLES `fleet_contacts` WRITE;
/*!40000 ALTER TABLE `fleet_contacts` DISABLE KEYS */;
/*!40000 ALTER TABLE `fleet_contacts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fleet_event_types`
--

DROP TABLE IF EXISTS `fleet_event_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_event_types` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `label` varchar(100) NOT NULL,
  `color` varchar(20) NOT NULL DEFAULT 'badge-ghost',
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fleet_event_types`
--

LOCK TABLES `fleet_event_types` WRITE;
/*!40000 ALTER TABLE `fleet_event_types` DISABLE KEYS */;
INSERT INTO `fleet_event_types` VALUES
(1,'Service','badge-ghost',1,'2026-05-07 13:45:26'),
(2,'Upgrade','badge-success',2,'2026-05-07 13:45:36'),
(3,'Inspection','badge-ghost',3,'2026-05-07 13:45:58'),
(4,'Incident','badge-danger',4,'2026-05-07 13:46:07'),
(5,'Repaint','badge-warning',5,'2026-05-07 13:46:24'),
(6,'Avionics Update','badge-success',6,'2026-05-07 13:46:44'),
(7,'Ownership Change','badge-ghost',7,'2026-05-07 13:46:59'),
(8,'Warranty Service','badge-info',8,'2026-05-07 13:48:33');
/*!40000 ALTER TABLE `fleet_event_types` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fleet_events`
--

DROP TABLE IF EXISTS `fleet_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_events` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `aircraft_id` int(11) NOT NULL,
  `event_date` date NOT NULL,
  `event_type` varchar(100) NOT NULL DEFAULT 'other',
  `title` varchar(200) NOT NULL,
  `description` text DEFAULT NULL,
  `hours_at_event` decimal(8,2) DEFAULT NULL,
  `logged_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `aircraft_id` (`aircraft_id`),
  KEY `logged_by` (`logged_by`),
  CONSTRAINT `fleet_events_ibfk_1` FOREIGN KEY (`aircraft_id`) REFERENCES `fleet_aircraft` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fleet_events_ibfk_2` FOREIGN KEY (`logged_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fleet_events`
--

LOCK TABLES `fleet_events` WRITE;
/*!40000 ALTER TABLE `fleet_events` DISABLE KEYS */;
INSERT INTO `fleet_events` VALUES
(1,13,'2021-04-16','incident','Emergency landing at Karup (military airbase)','When the plane was about to land, the pilot discovered that one of the wheels in the undercarriage would not unfold and was circling over Herning Airport (EKHG) to it was decided to divert and make an emergency landing at Karup (military airbase) EKKA, where there is emergency equipment. The emergency landing was made on a gress field with only material damage.',NULL,1,'2026-05-06 13:45:13'),
(2,21,'2026-05-07','Warranty Service','Fuel Leak','Fuel leak in RH wing from RED fuel hose. Found 2 pin holes and leaking from 90 degree connector at fuel tank.',23.90,1,'2026-05-07 13:50:26'),
(3,21,'2026-05-07','Warranty Service','Fuel Indication Fault','Both fuel level senders unreliable, showed full tank all the time. Both fuel level senders replaced and recalibrated for MOGAS.',23.90,1,'2026-05-07 13:51:53'),
(4,21,'2026-05-07','service','25h inspection Fuselage & Wings','Preformed as goodwill.',23.90,1,'2026-05-07 13:52:59'),
(5,21,'2026-01-18','service','25h Engine Service','Rotax 25h Engine Inspection and Service.',18.00,1,'2026-05-07 13:53:40');
/*!40000 ALTER TABLE `fleet_events` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fleet_images`
--

DROP TABLE IF EXISTS `fleet_images`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_images` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `aircraft_id` int(11) NOT NULL,
  `filename` varchar(300) NOT NULL,
  `caption` varchar(200) DEFAULT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `uploaded_by` int(11) DEFAULT NULL,
  `uploaded_at` timestamp NULL DEFAULT current_timestamp(),
  `is_cover` tinyint(1) NOT NULL DEFAULT 0,
  `category` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `aircraft_id` (`aircraft_id`),
  KEY `uploaded_by` (`uploaded_by`),
  CONSTRAINT `fleet_images_ibfk_1` FOREIGN KEY (`aircraft_id`) REFERENCES `fleet_aircraft` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fleet_images_ibfk_2` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=43 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fleet_images`
--

LOCK TABLES `fleet_images` WRITE;
/*!40000 ALTER TABLE `fleet_images` DISABLE KEYS */;
INSERT INTO `fleet_images` VALUES
(1,1,'1778002504691-786440.jpg',NULL,0,1,'2026-05-05 17:35:04',1,NULL),
(2,2,'1778002697695-160965.jpg',NULL,0,1,'2026-05-05 17:38:18',1,NULL),
(3,4,'1778006002736-66848.jpg',NULL,0,1,'2026-05-05 18:33:23',1,NULL),
(4,6,'1778006379647-138007.jpg',NULL,0,1,'2026-05-05 18:39:40',1,NULL),
(5,7,'1778006461950-152475.jpg',NULL,0,1,'2026-05-05 18:41:02',1,NULL),
(6,8,'1778006536594-166991.jpg',NULL,0,1,'2026-05-05 18:42:16',1,NULL),
(7,9,'1778006617475-168433.jpg',NULL,0,1,'2026-05-05 18:43:38',1,NULL),
(8,10,'1778006683774-581068.jpg',NULL,0,1,'2026-05-05 18:44:44',1,NULL),
(9,11,'1778006833276-653532.jpg',NULL,0,1,'2026-05-05 18:47:13',1,NULL),
(10,12,'1778007025700-501595.jpg',NULL,0,1,'2026-05-05 18:50:28',1,NULL),
(11,13,'1778007180160-804955.jpg',NULL,0,1,'2026-05-05 18:53:00',0,NULL),
(12,14,'1778007297350-290098.jpg',NULL,0,1,'2026-05-05 18:54:57',1,NULL),
(13,15,'1778007350868-776453.jpg',NULL,0,1,'2026-05-05 18:55:51',1,NULL),
(14,16,'1778007529803-57285.jpg',NULL,0,1,'2026-05-05 18:58:50',1,NULL),
(15,17,'1778007701006-162096.jpg',NULL,0,1,'2026-05-05 19:01:41',1,NULL),
(16,18,'1778007834631-729683.jpg',NULL,0,1,'2026-05-05 19:03:55',1,NULL),
(17,19,'1778007902168-90167.jpg',NULL,0,1,'2026-05-05 19:05:02',1,NULL),
(18,20,'1778007956383-858366.jpg',NULL,0,1,'2026-05-05 19:05:56',1,NULL),
(19,21,'1778074520600-234642.jpg',NULL,0,1,'2026-05-06 13:35:21',0,NULL),
(20,3,'1778074539904-257011.jpg',NULL,0,1,'2026-05-06 13:35:41',1,NULL),
(21,22,'1778074632652-142892.jpg',NULL,0,1,'2026-05-06 13:37:13',1,NULL),
(22,5,'1778074903084-298357.jpg',NULL,0,1,'2026-05-06 13:41:43',1,NULL),
(23,13,'1778075014020-99848.jpg',NULL,0,1,'2026-05-06 13:43:34',1,NULL),
(24,28,'1778093077867-235438.jpg',NULL,0,1,'2026-05-06 18:44:38',0,NULL),
(25,29,'1778093145013-803631.jpg',NULL,0,1,'2026-05-06 18:45:45',1,NULL),
(26,30,'1778093266385-178682.jpg',NULL,0,1,'2026-05-06 18:47:46',1,NULL),
(27,31,'1778093362352-617746.jpg',NULL,0,1,'2026-05-06 18:49:22',1,NULL),
(29,23,'1778170458549-268911.jpg',NULL,0,1,'2026-05-07 16:14:18',1,NULL),
(30,40,'1778170504427-340594.jpg',NULL,0,1,'2026-05-07 16:15:04',1,NULL),
(31,39,'1778170751084-201437.jpg',NULL,0,1,'2026-05-07 16:19:11',1,NULL),
(32,24,'1778170820827-984528.jpg',NULL,0,1,'2026-05-07 16:20:20',1,NULL),
(33,25,'1778170870948-236679.jpg',NULL,0,1,'2026-05-07 16:21:11',1,NULL),
(34,26,'1778170923890-237288.jpg',NULL,0,1,'2026-05-07 16:22:04',1,NULL),
(35,27,'1778170951031-341888.jpg',NULL,0,1,'2026-05-07 16:22:31',1,NULL),
(36,34,'1778171158496-757759.jpg',NULL,0,1,'2026-05-07 16:25:58',1,NULL),
(37,35,'1778171236845-256463.jpg',NULL,0,1,'2026-05-07 16:27:17',1,NULL),
(38,36,'1778171247426-627910.jpg',NULL,0,1,'2026-05-07 16:27:27',1,NULL),
(39,37,'1778171464699-69199.jpg',NULL,0,1,'2026-05-07 16:31:04',1,NULL),
(40,28,'1778171734851-911008.jpg',NULL,0,1,'2026-05-07 16:35:34',1,NULL),
(41,38,'1778171839545-610407.jfif',NULL,0,1,'2026-05-07 16:37:19',1,NULL),
(42,21,'1778172015366-919230.jpg',NULL,0,1,'2026-05-07 16:40:15',1,NULL);
/*!40000 ALTER TABLE `fleet_images` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fleet_maintenance_photos`
--

DROP TABLE IF EXISTS `fleet_maintenance_photos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_maintenance_photos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `item_id` int(11) NOT NULL,
  `filename` varchar(255) NOT NULL,
  `caption` varchar(300) DEFAULT NULL,
  `uploaded_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `item_id` (`item_id`),
  KEY `uploaded_by` (`uploaded_by`),
  CONSTRAINT `fleet_maintenance_photos_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `fleet_planned_maintenance_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fleet_maintenance_photos_ibfk_2` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fleet_maintenance_photos`
--

LOCK TABLES `fleet_maintenance_photos` WRITE;
/*!40000 ALTER TABLE `fleet_maintenance_photos` DISABLE KEYS */;
/*!40000 ALTER TABLE `fleet_maintenance_photos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fleet_models`
--

DROP TABLE IF EXISTS `fleet_models`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_models` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `code` varchar(60) DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `show_in_configurator` tinyint(1) NOT NULL DEFAULT 0,
  `base_price` decimal(12,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fleet_model_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fleet_models`
--

LOCK TABLES `fleet_models` WRITE;
/*!40000 ALTER TABLE `fleet_models` DISABLE KEYS */;
INSERT INTO `fleet_models` VALUES
(1,'BW600FG','BW60',1,0,'2026-05-10 19:25:12',0,NULL),
(2,'BW600RG','BW60',1,0,'2026-05-11 15:42:39',0,NULL),
(3,'BW635RG','BW6T',1,0,'2026-05-11 15:42:55',0,NULL),
(4,'BW650','BW6T',1,0,'2026-05-11 15:42:59',1,300000.00),
(5,'BW650SW','BW65',1,0,'2026-05-11 15:43:07',0,NULL);
/*!40000 ALTER TABLE `fleet_models` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fleet_paints`
--

DROP TABLE IF EXISTS `fleet_paints`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_paints` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `aircraft_id` int(11) NOT NULL,
  `color_name` varchar(120) NOT NULL,
  `paint_code` varchar(120) DEFAULT NULL,
  `area` varchar(120) DEFAULT NULL,
  `notes` varchar(300) DEFAULT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `aircraft_id` (`aircraft_id`),
  CONSTRAINT `fleet_paints_ibfk_1` FOREIGN KEY (`aircraft_id`) REFERENCES `fleet_aircraft` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fleet_paints`
--

LOCK TABLES `fleet_paints` WRITE;
/*!40000 ALTER TABLE `fleet_paints` DISABLE KEYS */;
/*!40000 ALTER TABLE `fleet_paints` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fleet_paperwork`
--

DROP TABLE IF EXISTS `fleet_paperwork`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_paperwork` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `aircraft_id` int(11) NOT NULL,
  `filename` varchar(300) NOT NULL,
  `original_name` varchar(300) NOT NULL,
  `mimetype` varchar(100) NOT NULL DEFAULT '',
  `size_bytes` int(11) NOT NULL DEFAULT 0,
  `title` varchar(200) DEFAULT NULL,
  `category` varchar(100) DEFAULT NULL,
  `uploaded_by` int(11) DEFAULT NULL,
  `uploaded_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `aircraft_id` (`aircraft_id`),
  KEY `uploaded_by` (`uploaded_by`),
  CONSTRAINT `fleet_paperwork_ibfk_1` FOREIGN KEY (`aircraft_id`) REFERENCES `fleet_aircraft` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fleet_paperwork_ibfk_2` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fleet_paperwork`
--

LOCK TABLES `fleet_paperwork` WRITE;
/*!40000 ALTER TABLE `fleet_paperwork` DISABLE KEYS */;
/*!40000 ALTER TABLE `fleet_paperwork` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fleet_part_replacements`
--

DROP TABLE IF EXISTS `fleet_part_replacements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_part_replacements` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `aircraft_id` int(11) NOT NULL,
  `component_serial_id` int(11) DEFAULT NULL,
  `component_type` varchar(120) DEFAULT NULL,
  `component_name` varchar(180) DEFAULT NULL,
  `old_part_serial` varchar(120) NOT NULL,
  `new_part_serial` varchar(120) NOT NULL,
  `reason` text DEFAULT NULL,
  `replacement_date` date NOT NULL,
  `flight_hours` decimal(8,2) DEFAULT NULL,
  `technician` varchar(120) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `aircraft_id` (`aircraft_id`),
  KEY `component_serial_id` (`component_serial_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `fleet_part_replacements_ibfk_1` FOREIGN KEY (`aircraft_id`) REFERENCES `fleet_aircraft` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fleet_part_replacements_ibfk_2` FOREIGN KEY (`component_serial_id`) REFERENCES `fleet_serial_numbers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fleet_part_replacements_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fleet_part_replacements`
--

LOCK TABLES `fleet_part_replacements` WRITE;
/*!40000 ALTER TABLE `fleet_part_replacements` DISABLE KEYS */;
/*!40000 ALTER TABLE `fleet_part_replacements` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fleet_planned_maintenance`
--

DROP TABLE IF EXISTS `fleet_planned_maintenance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_planned_maintenance` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `aircraft_id` int(11) NOT NULL,
  `template_id` int(11) DEFAULT NULL,
  `planned_date` date NOT NULL,
  `planned_comments` text DEFAULT NULL,
  `status` enum('planned','completed') NOT NULL DEFAULT 'planned',
  `completed_date` date DEFAULT NULL,
  `labor_hours` decimal(8,2) DEFAULT NULL,
  `additional_work` text DEFAULT NULL,
  `signoff_notes` text DEFAULT NULL,
  `signed_off_by` varchar(100) DEFAULT NULL,
  `signed_off_at` timestamp NULL DEFAULT NULL,
  `planned_by` int(11) DEFAULT NULL,
  `completed_record_id` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `planned_arrival_date` date DEFAULT NULL,
  `assigned_technician_id` int(11) DEFAULT NULL,
  `customer_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `aircraft_id` (`aircraft_id`),
  KEY `template_id` (`template_id`),
  KEY `planned_by` (`planned_by`),
  KEY `completed_record_id` (`completed_record_id`),
  CONSTRAINT `fleet_planned_maintenance_ibfk_1` FOREIGN KEY (`aircraft_id`) REFERENCES `fleet_aircraft` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fleet_planned_maintenance_ibfk_2` FOREIGN KEY (`template_id`) REFERENCES `fleet_service_templates` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fleet_planned_maintenance_ibfk_3` FOREIGN KEY (`planned_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fleet_planned_maintenance_ibfk_4` FOREIGN KEY (`completed_record_id`) REFERENCES `fleet_service_records` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fleet_planned_maintenance`
--

LOCK TABLES `fleet_planned_maintenance` WRITE;
/*!40000 ALTER TABLE `fleet_planned_maintenance` DISABLE KEYS */;
INSERT INTO `fleet_planned_maintenance` VALUES
(1,21,4,'2026-05-09','Only airframe, engine service already done by customer.','completed','2026-05-10',4.00,NULL,'Only airframe, engine service already done by customer.','Administrator','2026-05-10 09:08:09',1,1,'2026-05-10 09:07:13',NULL,NULL,NULL),
(2,11,NULL,'2026-05-27','ygyug','planned',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-24 16:01:27','2026-05-27',NULL,1);
/*!40000 ALTER TABLE `fleet_planned_maintenance` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fleet_planned_maintenance_items`
--

DROP TABLE IF EXISTS `fleet_planned_maintenance_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_planned_maintenance_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `planned_id` int(11) NOT NULL,
  `template_id` int(11) DEFAULT NULL,
  `title` varchar(200) NOT NULL,
  `description` text DEFAULT NULL,
  `signed_off` tinyint(1) NOT NULL DEFAULT 0,
  `signed_off_by` varchar(120) DEFAULT NULL,
  `signed_off_at` timestamp NULL DEFAULT NULL,
  `signed_off_record_id` int(11) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `completed_date` date DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `planned_id` (`planned_id`),
  KEY `template_id` (`template_id`),
  KEY `signed_off_record_id` (`signed_off_record_id`),
  CONSTRAINT `fleet_planned_maintenance_items_ibfk_1` FOREIGN KEY (`planned_id`) REFERENCES `fleet_planned_maintenance` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fleet_planned_maintenance_items_ibfk_2` FOREIGN KEY (`template_id`) REFERENCES `fleet_service_templates` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fleet_planned_maintenance_items_ibfk_3` FOREIGN KEY (`signed_off_record_id`) REFERENCES `fleet_service_records` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fleet_planned_maintenance_items`
--

LOCK TABLES `fleet_planned_maintenance_items` WRITE;
/*!40000 ALTER TABLE `fleet_planned_maintenance_items` DISABLE KEYS */;
INSERT INTO `fleet_planned_maintenance_items` VALUES
(1,2,NULL,'test',NULL,0,NULL,NULL,NULL,NULL,0,'2026-05-24 16:01:27',NULL),
(2,2,NULL,'test','test',0,NULL,NULL,NULL,NULL,1,'2026-05-24 16:01:27',NULL),
(3,2,NULL,'test',NULL,0,NULL,NULL,NULL,NULL,2,'2026-05-24 16:01:27',NULL),
(4,2,NULL,'test',NULL,0,NULL,NULL,NULL,NULL,3,'2026-05-24 16:01:27',NULL);
/*!40000 ALTER TABLE `fleet_planned_maintenance_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fleet_serial_numbers`
--

DROP TABLE IF EXISTS `fleet_serial_numbers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_serial_numbers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `aircraft_id` int(11) NOT NULL,
  `component` varchar(100) NOT NULL,
  `serial_number` varchar(200) NOT NULL,
  `notes` varchar(300) DEFAULT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `component_type` varchar(120) DEFAULT NULL,
  `component_name` varchar(180) DEFAULT NULL,
  `date_installed` date DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `repack_date` date DEFAULT NULL,
  `software_version` varchar(120) DEFAULT NULL,
  `system_id` varchar(120) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `uninstalled` tinyint(1) NOT NULL DEFAULT 0,
  `uninstalled_at` date DEFAULT NULL,
  `uninstall_reason` text DEFAULT NULL,
  `uninstall_tsn` decimal(8,2) DEFAULT NULL,
  `uninstall_technician` varchar(120) DEFAULT NULL,
  `uninstall_notes` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `aircraft_id` (`aircraft_id`),
  CONSTRAINT `fleet_serial_numbers_ibfk_1` FOREIGN KEY (`aircraft_id`) REFERENCES `fleet_aircraft` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fleet_serial_numbers`
--

LOCK TABLES `fleet_serial_numbers` WRITE;
/*!40000 ALTER TABLE `fleet_serial_numbers` DISABLE KEYS */;
/*!40000 ALTER TABLE `fleet_serial_numbers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fleet_service_records`
--

DROP TABLE IF EXISTS `fleet_service_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_service_records` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `aircraft_id` int(11) NOT NULL,
  `template_id` int(11) NOT NULL,
  `completed_date` date NOT NULL,
  `hours_at_completion` decimal(8,2) DEFAULT NULL,
  `signed_by` varchar(100) NOT NULL,
  `notes` text DEFAULT NULL,
  `logged_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `aircraft_id` (`aircraft_id`),
  KEY `template_id` (`template_id`),
  KEY `logged_by` (`logged_by`),
  CONSTRAINT `fleet_service_records_ibfk_1` FOREIGN KEY (`aircraft_id`) REFERENCES `fleet_aircraft` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fleet_service_records_ibfk_2` FOREIGN KEY (`template_id`) REFERENCES `fleet_service_templates` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fleet_service_records_ibfk_3` FOREIGN KEY (`logged_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fleet_service_records`
--

LOCK TABLES `fleet_service_records` WRITE;
/*!40000 ALTER TABLE `fleet_service_records` DISABLE KEYS */;
/*!40000 ALTER TABLE `fleet_service_records` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fleet_service_templates`
--

DROP TABLE IF EXISTS `fleet_service_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_service_templates` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `category` varchar(50) NOT NULL DEFAULT 'General',
  `title` varchar(200) NOT NULL,
  `interval_hours` int(11) DEFAULT NULL,
  `interval_months` int(11) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `is_one_time` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fleet_service_templates`
--

LOCK TABLES `fleet_service_templates` WRITE;
/*!40000 ALTER TABLE `fleet_service_templates` DISABLE KEYS */;
INSERT INTO `fleet_service_templates` VALUES
(1,'Engine','25h Engine Service',25,NULL,NULL,0,1,'2026-05-07 13:54:06',1),
(2,'Engine','100h Engine Service',100,12,NULL,0,1,'2026-05-07 13:54:22',0),
(3,'Engine','200h Engine Service',200,NULL,NULL,0,1,'2026-05-07 13:54:32',1),
(4,'Airframe','25h Airframe Inspection',25,NULL,NULL,0,1,'2026-05-07 13:54:49',1),
(5,'Airframe','100h Airframe Inspection',100,12,NULL,0,1,'2026-05-07 13:55:05',0),
(6,'Airframe','200h Airframe Inspection',200,NULL,NULL,0,1,'2026-05-07 13:55:14',1);
/*!40000 ALTER TABLE `fleet_service_templates` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `loss_logs`
--

DROP TABLE IF EXISTS `loss_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `loss_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `task_instance_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `reason` enum('walked_to_warehouse','fix_issue','missing_tools','waiting_for_material','machine_downtime','other') NOT NULL,
  `duration_minutes` decimal(10,2) NOT NULL,
  `notes` text DEFAULT NULL,
  `logged_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `task_instance_id` (`task_instance_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `loss_logs_ibfk_1` FOREIGN KEY (`task_instance_id`) REFERENCES `task_instances` (`id`),
  CONSTRAINT `loss_logs_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `loss_logs`
--

LOCK TABLES `loss_logs` WRITE;
/*!40000 ALTER TABLE `loss_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `loss_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ncr_approvals`
--

DROP TABLE IF EXISTS `ncr_approvals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `ncr_approvals` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ncr_id` int(11) NOT NULL,
  `approved_by` int(11) NOT NULL,
  `approved_at` timestamp NULL DEFAULT current_timestamp(),
  `action` varchar(100) NOT NULL,
  `notes` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ncr_id` (`ncr_id`),
  KEY `approved_by` (`approved_by`),
  CONSTRAINT `ncr_approvals_ibfk_1` FOREIGN KEY (`ncr_id`) REFERENCES `nonconformity_reports` (`id`),
  CONSTRAINT `ncr_approvals_ibfk_2` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ncr_approvals`
--

LOCK TABLES `ncr_approvals` WRITE;
/*!40000 ALTER TABLE `ncr_approvals` DISABLE KEYS */;
/*!40000 ALTER TABLE `ncr_approvals` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `nonconformity_reports`
--

DROP TABLE IF EXISTS `nonconformity_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `nonconformity_reports` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `airplane_id` int(11) NOT NULL,
  `task_instance_id` int(11) DEFAULT NULL,
  `station_id` int(11) NOT NULL,
  `reported_by` int(11) NOT NULL,
  `description` text NOT NULL,
  `severity` enum('low','medium','high') NOT NULL,
  `status` enum('open','under_review','resolved') NOT NULL DEFAULT 'open',
  `resolution_notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `resolved_at` timestamp NULL DEFAULT NULL,
  `full_name` varchar(100) DEFAULT NULL,
  `part_assembly_number` varchar(100) DEFAULT NULL,
  `drawing_number` varchar(100) DEFAULT NULL,
  `is_safety_concern` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `airplane_id` (`airplane_id`),
  KEY `task_instance_id` (`task_instance_id`),
  KEY `station_id` (`station_id`),
  KEY `reported_by` (`reported_by`),
  CONSTRAINT `nonconformity_reports_ibfk_1` FOREIGN KEY (`airplane_id`) REFERENCES `airplanes` (`id`),
  CONSTRAINT `nonconformity_reports_ibfk_2` FOREIGN KEY (`task_instance_id`) REFERENCES `task_instances` (`id`),
  CONSTRAINT `nonconformity_reports_ibfk_3` FOREIGN KEY (`station_id`) REFERENCES `stations` (`id`),
  CONSTRAINT `nonconformity_reports_ibfk_4` FOREIGN KEY (`reported_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `nonconformity_reports`
--

LOCK TABLES `nonconformity_reports` WRITE;
/*!40000 ALTER TABLE `nonconformity_reports` DISABLE KEYS */;
/*!40000 ALTER TABLE `nonconformity_reports` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `role_permissions`
--

DROP TABLE IF EXISTS `role_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `role_permissions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `role` varchar(50) NOT NULL,
  `permission_key` varchar(100) NOT NULL,
  `allowed` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_role_permission` (`role`,`permission_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `role_permissions`
--

LOCK TABLES `role_permissions` WRITE;
/*!40000 ALTER TABLE `role_permissions` DISABLE KEYS */;
/*!40000 ALTER TABLE `role_permissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `stations`
--

DROP TABLE IF EXISTS `stations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `stations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `stations`
--

LOCK TABLES `stations` WRITE;
/*!40000 ALTER TABLE `stations` DISABLE KEYS */;
INSERT INTO `stations` VALUES
(1,'F3-Prep'),
(2,'F3-S1'),
(3,'F3-S2'),
(4,'F3-S3a'),
(5,'F3-S3B'),
(6,'F3-S4');
/*!40000 ALTER TABLE `stations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `task_instances`
--

DROP TABLE IF EXISTS `task_instances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `task_instances` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `airplane_id` int(11) NOT NULL,
  `template_id` int(11) NOT NULL,
  `station_id` int(11) NOT NULL,
  `status` enum('not_started','in_progress','pending_signoff','signed','double_signed') NOT NULL DEFAULT 'not_started',
  `started_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `installed_part_serial` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `airplane_id` (`airplane_id`),
  KEY `template_id` (`template_id`),
  KEY `station_id` (`station_id`),
  CONSTRAINT `task_instances_ibfk_1` FOREIGN KEY (`airplane_id`) REFERENCES `airplanes` (`id`),
  CONSTRAINT `task_instances_ibfk_2` FOREIGN KEY (`template_id`) REFERENCES `task_templates` (`id`),
  CONSTRAINT `task_instances_ibfk_3` FOREIGN KEY (`station_id`) REFERENCES `stations` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `task_instances`
--

LOCK TABLES `task_instances` WRITE;
/*!40000 ALTER TABLE `task_instances` DISABLE KEYS */;
/*!40000 ALTER TABLE `task_instances` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `task_signoffs`
--

DROP TABLE IF EXISTS `task_signoffs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `task_signoffs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `task_instance_id` int(11) NOT NULL,
  `signed_by_user_id` int(11) NOT NULL,
  `signed_at` timestamp NULL DEFAULT current_timestamp(),
  `signature_type` enum('primary','double') NOT NULL,
  PRIMARY KEY (`id`),
  KEY `task_instance_id` (`task_instance_id`),
  KEY `signed_by_user_id` (`signed_by_user_id`),
  CONSTRAINT `task_signoffs_ibfk_1` FOREIGN KEY (`task_instance_id`) REFERENCES `task_instances` (`id`),
  CONSTRAINT `task_signoffs_ibfk_2` FOREIGN KEY (`signed_by_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `task_signoffs`
--

LOCK TABLES `task_signoffs` WRITE;
/*!40000 ALTER TABLE `task_signoffs` DISABLE KEYS */;
/*!40000 ALTER TABLE `task_signoffs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `task_templates`
--

DROP TABLE IF EXISTS `task_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `task_templates` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `station_id` int(11) NOT NULL,
  `title` varchar(200) NOT NULL,
  `description` text DEFAULT NULL,
  `estimated_minutes` int(11) NOT NULL DEFAULT 60,
  `order_index` int(11) NOT NULL DEFAULT 0,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `op_number` varchar(20) DEFAULT NULL,
  `is_section_header` tinyint(1) NOT NULL DEFAULT 0,
  `kits_required` text DEFAULT NULL,
  `drawing_reference` varchar(200) DEFAULT NULL,
  `instructions` text DEFAULT NULL,
  `requires_serial_number` tinyint(1) NOT NULL DEFAULT 0,
  `image_urls` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `station_id` (`station_id`),
  CONSTRAINT `task_templates_ibfk_1` FOREIGN KEY (`station_id`) REFERENCES `stations` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=33 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `task_templates`
--

LOCK TABLES `task_templates` WRITE;
/*!40000 ALTER TABLE `task_templates` DISABLE KEYS */;
INSERT INTO `task_templates` VALUES
(1,1,'Retrieve material kit','Collect all carbon fiber materials and consumables from warehouse.',30,1,1,NULL,0,NULL,NULL,NULL,0,NULL),
(2,1,'Inspect raw materials','Visual and dimensional inspection of all incoming materials per spec sheet.',45,2,1,NULL,0,NULL,NULL,NULL,0,NULL),
(3,1,'Prepare work surfaces','Clean and tape mold surfaces. Apply release agent.',60,3,1,NULL,0,NULL,NULL,NULL,0,NULL),
(4,1,'Cut carbon fiber plies','Cut carbon fiber sheets to template dimensions. Label each ply.',90,4,1,NULL,0,NULL,NULL,NULL,0,NULL),
(5,1,'Pre-stage tooling','Stage all required tooling at the station. Verify calibration dates.',20,5,1,NULL,0,NULL,NULL,NULL,0,NULL),
(6,2,'Layup — fuselage lower shell (Layer 1)','Lay first carbon fiber ply into mold, ensuring zero wrinkles.',120,1,1,NULL,0,NULL,NULL,NULL,0,NULL),
(7,2,'Layup — fuselage lower shell (Layer 2)','Apply second ply with 45° orientation. Compact with roller.',120,2,1,NULL,0,NULL,NULL,NULL,0,NULL),
(8,2,'Layup — fuselage lower shell (Layer 3)','Apply third ply and peel ply. Check for air pockets.',120,3,1,NULL,0,NULL,NULL,NULL,0,NULL),
(9,2,'Vacuum bag setup','Apply breather cloth, vacuum bag, seal edges. Connect vacuum line.',60,4,1,NULL,0,NULL,NULL,NULL,0,NULL),
(10,2,'Vacuum integrity check','Hold vacuum at -0.9 bar for 15 min. Record pressure drop.',20,5,1,NULL,0,NULL,NULL,NULL,0,NULL),
(11,2,'Cure cycle initiation','Start oven cure cycle per process sheet F3-S1-CURE-001.',480,6,1,NULL,0,NULL,NULL,NULL,0,NULL),
(12,2,'Post-cure inspection','Tap test and visual inspection of cured part. Mark any defects.',45,7,1,NULL,0,NULL,NULL,NULL,0,NULL),
(13,3,'Layup — fuselage upper shell','Repeat layup procedure for upper fuselage shell.',360,1,1,NULL,0,NULL,NULL,NULL,0,NULL),
(14,3,'Core material installation','Bond foam core sections per drawing F3-S2-DRAW-002.',90,2,1,NULL,0,NULL,NULL,NULL,0,NULL),
(15,3,'Vacuum bag & cure — upper shell','Bag and cure upper shell per process sheet.',500,3,1,NULL,0,NULL,NULL,NULL,0,NULL),
(16,3,'Trim excess material','Trim cured parts to final dimensions using template.',60,4,1,NULL,0,NULL,NULL,NULL,0,NULL),
(17,3,'Fit check — upper to lower shell','Dry-fit upper and lower shells. Check gap and alignment.',45,5,1,NULL,0,NULL,NULL,NULL,0,NULL),
(18,4,'Wing spar layup','Layup main wing spar per drawing F3-S3a-DRAW-001.',180,1,1,NULL,0,NULL,NULL,NULL,0,NULL),
(19,4,'Wing rib installation','Bond pre-cured wing ribs at specified stations.',120,2,1,NULL,0,NULL,NULL,NULL,0,NULL),
(20,4,'Wing skin layup — lower','Layup lower wing skin over assembled ribs and spar.',240,3,1,NULL,0,NULL,NULL,NULL,0,NULL),
(21,4,'Wing skin layup — upper','Layup upper wing skin. Install inspection access panels.',240,4,1,NULL,0,NULL,NULL,NULL,0,NULL),
(22,4,'Wing cure & post-cure inspection','Cure assembled wing. Inspect for delamination.',540,5,1,NULL,0,NULL,NULL,NULL,0,NULL),
(23,5,'Control surface fabrication — ailerons','Layup and cure aileron panels.',200,1,1,NULL,0,NULL,NULL,NULL,0,NULL),
(24,5,'Control surface fabrication — flaps','Layup and cure flap panels.',200,2,1,NULL,0,NULL,NULL,NULL,0,NULL),
(25,5,'Hinge fitting installation','Bond hinge fittings. Verify alignment with jig.',90,3,1,NULL,0,NULL,NULL,NULL,0,NULL),
(26,5,'Control surface fit check','Fit ailerons and flaps to wing. Check deflection range.',60,4,1,NULL,0,NULL,NULL,NULL,0,NULL),
(27,6,'Fuselage join — upper/lower shells','Bond upper to lower fuselage shells. Torque all fasteners.',180,1,1,NULL,0,NULL,NULL,NULL,0,NULL),
(28,6,'Wing-to-fuselage attachment','Install wing-fuselage attachment bolts. Torque to spec.',120,2,1,NULL,0,NULL,NULL,NULL,0,NULL),
(29,6,'Systems installation — avionics bay','Install avionics mounting tray and connectors.',90,3,1,NULL,0,NULL,NULL,NULL,0,NULL),
(30,6,'Control linkage installation','Install and rig all primary control linkages.',150,4,1,NULL,0,NULL,NULL,NULL,0,NULL),
(31,6,'Final structural inspection','Full visual and tactile inspection of all bonded joints.',120,5,1,NULL,0,NULL,NULL,NULL,0,NULL),
(32,6,'Weight & balance check','Weigh aircraft and calculate CG. Record on data sheet.',60,6,1,NULL,0,NULL,NULL,NULL,0,NULL);
/*!40000 ALTER TABLE `task_templates` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `time_logs`
--

DROP TABLE IF EXISTS `time_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `time_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `task_instance_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `started_at` timestamp NULL DEFAULT current_timestamp(),
  `ended_at` timestamp NULL DEFAULT NULL,
  `duration_minutes` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `task_instance_id` (`task_instance_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `time_logs_ibfk_1` FOREIGN KEY (`task_instance_id`) REFERENCES `task_instances` (`id`),
  CONSTRAINT `time_logs_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `time_logs`
--

LOCK TABLES `time_logs` WRITE;
/*!40000 ALTER TABLE `time_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `time_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `username` varchar(50) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` varchar(50) NOT NULL DEFAULT 'worker',
  `force_password_change` tinyint(1) NOT NULL DEFAULT 0,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES
(1,'Administrator','admin','$2a$12$F87IXXJ.tc.4XOjHKBMzNuEQuae97EvLS6n7VgmLUqHR3EkqTyXq2','admin',0,1,'2026-05-05 17:33:32');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*M!100616 SET NOTE_VERBOSITY=@OLD_NOTE_VERBOSITY */;

-- Dump completed on 2026-05-25  4:44:19
