package com.habitline.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface TrackerDao {
    @Query("SELECT * FROM storage_migrations WHERE source = 'shared-prefs-v1'")
    fun migration(): StorageMigration?

    @Query("SELECT * FROM profiles WHERE id = :id")
    fun profile(id: String): LocalProfile?

    @Query("SELECT * FROM preferences WHERE profileId = :id")
    fun preferences(id: String): List<ProfilePreference>

    @Query("SELECT * FROM habits ORDER BY createdAt, id")
    fun habits(): List<LocalHabit>

    @Query("SELECT * FROM habits WHERE id = :id")
    fun habit(id: String): LocalHabit?

    @Query("SELECT * FROM schedule_revisions ORDER BY effectiveFrom")
    fun revisions(): List<ScheduleRevision>

    @Query("SELECT * FROM schedule_revisions WHERE habitId = :id AND effectiveFrom <= :day ORDER BY effectiveFrom DESC LIMIT 1")
    fun schedule(id: String, day: String): ScheduleRevision?

    @Query("SELECT * FROM schedule_revisions WHERE habitId = :id ORDER BY effectiveFrom DESC LIMIT 1")
    fun latestSchedule(id: String): ScheduleRevision?

    @Query("SELECT * FROM completions ORDER BY day, id")
    fun completions(): List<HabitCompletion>

    @Query("SELECT * FROM completions WHERE habitId = :id AND day = :day")
    fun completion(id: String, day: String): HabitCompletion?

    @Query("SELECT * FROM completions WHERE habitId = :id")
    fun habitCompletions(id: String): List<HabitCompletion>

    @Query("SELECT * FROM habit_relationships ORDER BY id")
    fun links(): List<HabitLink>

    @Query("SELECT * FROM habit_relationships WHERE id = :id")
    fun link(id: String): HabitLink?

    @Query("""SELECT * FROM habit_relationships WHERE (habitId = :first AND relatedHabitId = :second)
        OR (habitId = :second AND relatedHabitId = :first) LIMIT 1""")
    fun linkBetween(first: String, second: String): HabitLink?

    @Query("SELECT * FROM widget_bindings")
    fun widgets(): List<WidgetBinding>

    @Query("SELECT habitId FROM widget_bindings WHERE widgetId = :widgetId")
    fun boundHabit(widgetId: Int): String?

    @Query("SELECT amount FROM xp_events WHERE habitId = :id AND day = :day AND kind = 'award' ORDER BY rowid LIMIT 1")
    fun firstAward(id: String, day: String): Int?

    @Query("SELECT EXISTS(SELECT 1 FROM profiles)")
    fun hasProfile(): Boolean

    @Query("SELECT EXISTS(SELECT 1 FROM tombstones WHERE profileId = :owner AND entity = 'habit' AND entityId = :id)")
    fun wasDeleted(owner: String, id: String): Boolean

    @Query("""SELECT (SELECT count(*) FROM habits) + (SELECT count(*) FROM completions) +
        (SELECT count(*) FROM schedule_revisions) + (SELECT count(*) FROM profiles) +
        (SELECT count(*) FROM preferences) + (SELECT count(*) FROM widget_bindings) +
        (SELECT count(*) FROM habit_relationships)""")
    fun observeTracker(): Flow<Long>

    @Insert fun insert(profile: LocalProfile)
    @Insert fun insert(habit: LocalHabit)
    @Insert fun insert(revision: ScheduleRevision)
    @Insert fun insert(completion: HabitCompletion)
    @Insert fun insert(binding: WidgetBinding)
    @Insert fun insert(marker: StorageMigration)
    @Insert fun insert(event: XpEvent)
    @Insert fun insert(mutation: PendingMutation)
    @Insert fun insert(tombstone: Deletion)
    @Insert fun insert(link: HabitLink)
    @Update fun update(habit: LocalHabit)
    @Update fun update(profile: LocalProfile)
    @Update fun update(revision: ScheduleRevision)
    @Upsert fun bind(binding: WidgetBinding)
    @Upsert fun save(preference: ProfilePreference)

    @Query("DELETE FROM habits WHERE id = :id") fun deleteHabit(id: String)
    @Query("DELETE FROM completions WHERE id = :id") fun deleteCompletion(id: String)
    @Query("DELETE FROM habit_relationships WHERE id = :id") fun deleteLink(id: String)
    @Query("DELETE FROM widget_bindings WHERE widgetId = :id") fun clearWidget(id: Int)
}
