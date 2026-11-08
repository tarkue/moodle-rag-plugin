<?php
namespace local_rag;
defined('MOODLE_INTERNAL') || die();

/** Persistent budgets shared by sessions and PHP workers, using Moodle's lock backend. */
final class budget {
    const WINDOW = 60;
    // Longer than the service client's 180 second timeout; crashed requests expire safely.
    const LEASE_SECONDS = 210;

    /** Call only after authentication, course permission and payload validation. */
    public static function consume($action, $courseid, $expensive = false) {
        global $DB, $USER;
        $limits = array('ask' => array(10, 20, 100), 'history' => array(30, 60, 300),
            'sync' => array(1, 10, 60));
        if (!isset($limits[$action]) || ($expensive && $action !== 'ask')) {
            throw new \coding_exception('Unknown RAG budget');
        }
        $lock = self::lock();
        try {
            $now = time();
            $keys = array($action . ':course:' . (int)$courseid . ':user:' . (int)$USER->id,
                $action . ':user:' . (int)$USER->id, $action . ':global');
            // A shared course cooldown also stops multiple teachers queuing the same course.
            if ($action === 'sync') {
                $keys[0] = 'sync:course:' . (int)$courseid;
            }
            $rows = array();
            foreach ($keys as $index => $key) {
                $row = self::read($key, $now);
                $row->state['events'] = array_values(array_filter($row->state['events'], function($stamp) use ($now) {
                    return is_int($stamp) && $stamp > $now - self::WINDOW;
                }));
                if (count($row->state['events']) >= $limits[$action][$index]) {
                    throw new budget_exceeded($row->state['events'][0] + self::WINDOW - $now);
                }
                $rows[] = $row;
            }
            $lease = null;
            if ($expensive) {
                $global = $rows[2];
                $active = array();
                foreach ($global->state['leases'] as $token => $entry) {
                    if (is_array($entry) && isset($entry['until'], $entry['user']) && $entry['until'] > $now) {
                        $active[$token] = $entry;
                    }
                }
                foreach ($active as $entry) {
                    if ((int)$entry['user'] === (int)$USER->id) {
                        throw new budget_exceeded(min(self::WINDOW, $entry['until'] - $now));
                    }
                }
                if (count($active) >= 4) {
                    throw new budget_exceeded(5);
                }
                $lease = bin2hex(random_bytes(16));
                $active[$lease] = array('user' => (int)$USER->id, 'until' => $now + self::LEASE_SECONDS);
                $global->state['leases'] = $active;
            }
            foreach ($rows as $row) {
                $row->state['events'][] = $now;
                self::write($row, $now);
            }
            // Indexed cleanup keeps long-lived installations bounded without a per-user cache.
            $DB->delete_records_select('local_rag_budget', 'timemodified < :cutoff', array('cutoff' => $now - 600));
            return $lease;
        } finally {
            $lock->release();
        }
    }

    public static function release($lease) {
        if (!is_string($lease) || !preg_match('/^[a-f0-9]{32}$/D', $lease)) {
            return;
        }
        try {
            $lock = self::lock(1);
            try {
                $row = self::read('ask:global', time());
                unset($row->state['leases'][$lease]);
                self::write($row, time());
            } finally {
                $lock->release();
            }
        } catch (\Throwable $error) {
            // Preserve the prepared response/original failure. A lost release fails closed
            // until the bounded lease expires; never log request details or credentials.
        }
    }

    private static function lock($wait = 0) {
        $factory = \core\lock\lock_config::get_lock_factory('local_rag');
        // Reject contention rather than making unbounded workers wait on a queue.
        $lock = $factory->get_lock('request-budget', $wait);
        if (!$lock) {
            throw new budget_exceeded(1);
        }
        return $lock;
    }

    private static function read($key, $now) {
        global $DB;
        $row = $DB->get_record('local_rag_budget', array('bucket' => $key));
        if (!$row) {
            return (object)array('bucket' => $key, 'state' => array('events' => array(), 'leases' => array()),
                'timemodified' => $now);
        }
        $state = json_decode($row->state, true);
        // Corrupt persistent state fails closed instead of granting a fresh budget.
        if (!is_array($state) || !isset($state['events'], $state['leases']) ||
                !is_array($state['events']) || !is_array($state['leases'])) {
            throw new budget_exceeded(60);
        }
        $row->state = $state;
        return $row;
    }

    private static function write($row, $now) {
        global $DB;
        $record = clone $row;
        $record->state = json_encode($row->state);
        $record->timemodified = $now;
        if (isset($record->id)) {
            $DB->update_record('local_rag_budget', $record);
        } else {
            $DB->insert_record('local_rag_budget', $record);
        }
    }
}
